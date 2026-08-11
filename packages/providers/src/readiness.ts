export interface ProviderEnvironment extends Record<string, string | undefined> {
  DATABASE_URL?: string;
  OPENAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_AGENT_ID?: string;
  ELEVENLABS_PHONE_NUMBER_ID?: string;
  ENRICHMENT_API_URL?: string;
  ENRICHMENT_API_KEY?: string;
  SIGNATURE_API_URL?: string;
  SIGNATURE_API_KEY?: string;
  BUYER_OUTREACH_API_URL?: string;
  BUYER_OUTREACH_API_KEY?: string;
  CLOSING_API_URL?: string;
  CLOSING_API_KEY?: string;
  OUTBOX_WEBHOOK_URL?: string;
  OUTBOX_WEBHOOK_API_KEY?: string;
}

export type ProviderReadinessId =
  | 'postgres'
  | 'openai-seller'
  | 'elevenlabs-voice'
  | 'enrichment'
  | 'signature'
  | 'buyer-outreach'
  | 'closing'
  | 'outbox-webhook';

export interface ProviderReadiness {
  id: ProviderReadinessId;
  configured: boolean;
  liveVerified: false;
  requiredEnv: string[];
  missingEnv: string[];
}

export interface DeferredCapability {
  id: 'openai-transcript-interpreter';
  status: 'deferred';
  reason: string;
}

export interface ProviderReadinessReport {
  allConfigured: boolean;
  configuredCount: number;
  totalCount: number;
  providers: ProviderReadiness[];
  deferred: DeferredCapability[];
}

interface Requirement {
  id: ProviderReadinessId;
  requiredEnv: readonly string[];
}

const REQUIREMENTS: readonly Requirement[] = [
  { id: 'postgres', requiredEnv: ['DATABASE_URL'] },
  { id: 'openai-seller', requiredEnv: ['OPENAI_API_KEY'] },
  {
    id: 'elevenlabs-voice',
    requiredEnv: ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_PHONE_NUMBER_ID'],
  },
  { id: 'enrichment', requiredEnv: ['ENRICHMENT_API_URL', 'ENRICHMENT_API_KEY'] },
  { id: 'signature', requiredEnv: ['SIGNATURE_API_URL', 'SIGNATURE_API_KEY'] },
  {
    id: 'buyer-outreach',
    requiredEnv: ['BUYER_OUTREACH_API_URL', 'BUYER_OUTREACH_API_KEY'],
  },
  { id: 'closing', requiredEnv: ['CLOSING_API_URL', 'CLOSING_API_KEY'] },
  { id: 'outbox-webhook', requiredEnv: ['OUTBOX_WEBHOOK_URL', 'OUTBOX_WEBHOOK_API_KEY'] },
];

function isPresent(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function inspectProviderReadiness(
  environment: ProviderEnvironment = process.env,
): ProviderReadinessReport {
  const providers = REQUIREMENTS.map((requirement): ProviderReadiness => {
    const requiredEnv = [...requirement.requiredEnv];
    const missingEnv = requiredEnv.filter((name) => !isPresent(environment[name]));
    return {
      id: requirement.id,
      configured: missingEnv.length === 0,
      liveVerified: false,
      requiredEnv,
      missingEnv,
    };
  });
  const configuredCount = providers.filter((provider) => provider.configured).length;
  return {
    allConfigured: configuredCount === providers.length,
    configuredCount,
    totalCount: providers.length,
    providers,
    deferred: [{
      id: 'openai-transcript-interpreter',
      status: 'deferred',
      reason: 'Deferred by operator decision; no credential or live request is required.',
    }],
  };
}
