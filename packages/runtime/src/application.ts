import { OpenAISellerConversationProvider } from '../../ai/src/openai-seller-provider.ts';
import { FetchHttpTransport } from '../../ingestion/src/http.ts';
import { InMemoryDealFlowStore } from '../../persistence/src/in-memory-store.ts';
import { createNodePostgresClient, type NodePostgresSqlClient } from '../../persistence/src/node-postgres.ts';
import { PostgresDealFlowStore } from '../../persistence/src/postgres-store.ts';
import type { SqlClient, SqlConnection, TransactionalDealFlowStore } from '../../persistence/src/contracts.ts';
import {
  CanonicalBuyerOutreachHttpProvider,
  CanonicalClosingHttpProvider,
  CanonicalEnrichmentHttpProvider,
  CanonicalSignatureHttpProvider,
} from '../../providers/src/http-adapters.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../../providers/src/simulators.ts';
import type {
  BuyerOutreachProvider,
  ClosingProvider,
  EnrichmentProvider,
  SellerConversationProvider,
  SignatureProvider,
} from '../../providers/src/contracts.ts';
import { MetricsRegistry } from '../../telemetry/src/metrics.ts';
import { ResumableDealFlow } from '../../workflows/src/resumable-deal-flow.ts';
import { SystemRuntime } from './system-runtime.ts';

export type ProviderMode = 'simulated' | 'live';
export type PersistenceMode = 'memory' | 'postgres';

export interface ApplicationReadiness {
  ready: boolean;
  checks: Record<string, string>;
}

export interface ApplicationContext {
  runtime: SystemRuntime;
  store: TransactionalDealFlowStore;
  metrics: MetricsRegistry;
  workflow: ResumableDealFlow;
  providerMode: ProviderMode;
  persistenceMode: PersistenceMode;
  readiness(): Promise<ApplicationReadiness>;
  close(): Promise<void>;
}

interface PostgresReadinessRow extends Record<string, unknown> {
  postgis_version: string | null;
  workflow_checkpoints: string | null;
  outbox: string | null;
}

export async function probePostgresReadiness(client: SqlClient): Promise<ApplicationReadiness> {
  let connection: SqlConnection | undefined;
  try {
    connection = await client.connect();
    const result = await connection.query<PostgresReadinessRow>(
      `SELECT PostGIS_Version() AS postgis_version,
              to_regclass('public.workflow_checkpoints')::text AS workflow_checkpoints,
              to_regclass('public.outbox')::text AS outbox`,
    );
    const row = result.rows[0];
    if (!row || typeof row.postgis_version !== 'string' || row.postgis_version.length === 0
      || row.workflow_checkpoints !== 'workflow_checkpoints' || row.outbox !== 'outbox') {
      return {
        ready: false,
        checks: {
          persistence: 'postgres:incomplete',
          postgis: typeof row?.postgis_version === 'string' ? row.postgis_version : 'missing',
          migrations: 'core:missing',
        },
      };
    }
    return {
      ready: true,
      checks: {
        persistence: 'postgres:connected',
        postgis: row.postgis_version,
        migrations: 'core:present',
      },
    };
  } catch {
    return {
      ready: false,
      checks: {
        persistence: 'postgres:unavailable',
        postgis: 'unknown',
        migrations: 'unknown',
      },
    };
  } finally {
    connection?.release();
  }
}

interface ProviderSet {
  enrichment: EnrichmentProvider;
  seller: SellerConversationProvider;
  signature: SignatureProvider;
  buyerOutreach: BuyerOutreachProvider;
  closing: ClosingProvider;
}

function value(env: Record<string, string | undefined>, name: string): string | undefined {
  const resolved = env[name]?.trim();
  return resolved && resolved.length > 0 ? resolved : undefined;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const resolved = value(env, name);
  if (!resolved) throw new Error(`${name} is required for live provider mode`);
  return resolved;
}

function providerMode(env: Record<string, string | undefined>): ProviderMode {
  const mode = value(env, 'TRADEWIND_PROVIDER_MODE') ?? 'simulated';
  if (mode !== 'simulated' && mode !== 'live') {
    throw new Error('TRADEWIND_PROVIDER_MODE must be simulated or live');
  }
  return mode;
}

function validateLiveEnvironment(env: Record<string, string | undefined>): void {
  const names = [
    'OPENAI_API_KEY',
    'ENRICHMENT_API_URL',
    'ENRICHMENT_API_KEY',
    'SIGNATURE_API_URL',
    'SIGNATURE_API_KEY',
    'BUYER_OUTREACH_API_URL',
    'BUYER_OUTREACH_API_KEY',
    'CLOSING_API_URL',
    'CLOSING_API_KEY',
  ];
  const missing = names.filter((name) => value(env, name) === undefined);
  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} is required for live provider mode`);
  }
}

function createProviders(env: Record<string, string | undefined>, mode: ProviderMode): ProviderSet {
  if (mode === 'simulated') {
    return {
      enrichment: new SimulatedEnrichmentProvider(),
      seller: new SimulatedSellerConversationProvider(),
      signature: new SimulatedSignatureProvider(),
      buyerOutreach: new SimulatedBuyerOutreachProvider(),
      closing: new SimulatedClosingProvider(),
    };
  }

  validateLiveEnvironment(env);
  const transport = new FetchHttpTransport();
  return {
    enrichment: new CanonicalEnrichmentHttpProvider({
      endpoint: required(env, 'ENRICHMENT_API_URL'),
      apiKey: required(env, 'ENRICHMENT_API_KEY'),
      transport,
    }),
    seller: new OpenAISellerConversationProvider({ apiKey: required(env, 'OPENAI_API_KEY') }),
    signature: new CanonicalSignatureHttpProvider({
      endpoint: required(env, 'SIGNATURE_API_URL'),
      apiKey: required(env, 'SIGNATURE_API_KEY'),
      transport,
    }),
    buyerOutreach: new CanonicalBuyerOutreachHttpProvider({
      endpoint: required(env, 'BUYER_OUTREACH_API_URL'),
      apiKey: required(env, 'BUYER_OUTREACH_API_KEY'),
      transport,
    }),
    closing: new CanonicalClosingHttpProvider({
      endpoint: required(env, 'CLOSING_API_URL'),
      apiKey: required(env, 'CLOSING_API_KEY'),
      transport,
    }),
  };
}

export async function createApplicationContext(
  env: Record<string, string | undefined> = process.env,
): Promise<ApplicationContext> {
  const mode = providerMode(env);
  const providers = createProviders(env, mode);
  const databaseUrl = value(env, 'DATABASE_URL');
  let postgresClient: NodePostgresSqlClient | undefined;
  let store: TransactionalDealFlowStore;
  let persistenceMode: PersistenceMode;

  if (databaseUrl) {
    postgresClient = await createNodePostgresClient({ connectionString: databaseUrl });
    store = new PostgresDealFlowStore(postgresClient);
    persistenceMode = 'postgres';
  } else {
    store = new InMemoryDealFlowStore();
    persistenceMode = 'memory';
  }

  const runtime = new SystemRuntime();
  const metrics = new MetricsRegistry();
  const workflow = new ResumableDealFlow({ runtime, store, ...providers });

  return {
    runtime,
    store,
    metrics,
    workflow,
    providerMode: mode,
    persistenceMode,
    async readiness(): Promise<ApplicationReadiness> {
      if (!postgresClient) {
        return {
          ready: true,
          checks: { persistence: 'memory', providers: mode },
        };
      }
      const persistence = await probePostgresReadiness(postgresClient);
      return {
        ready: persistence.ready,
        checks: { ...persistence.checks, providers: mode },
      };
    },
    async close(): Promise<void> {
      if (postgresClient) await postgresClient.close();
    },
  };
}
