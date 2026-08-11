import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import type { Clock, IdSource } from '../packages/domain/src/clock.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import type {
  DocumentArtifact,
  EnrichmentRun,
  Property,
} from '../packages/domain/src/types.ts';
import { renderDocument, createSignatureEnvelope, verifyArtifact, verifyEnvelopeArtifact } from '../packages/documents/src/render.ts';
import { InMemorySourceStateStore, SourceIngestionRunner, type SourceProvider } from '../packages/ingestion/src/source-runner.ts';
import type { OutboxRecord } from '../packages/persistence/src/contracts.ts';
import { InMemoryDealFlowStore } from '../packages/persistence/src/in-memory-store.ts';
import type {
  EnrichmentProvider,
  ProviderResult,
  Runtime,
  SellerConversationProvider,
  SellerConversationResult,
} from '../packages/providers/src/contracts.ts';
import { ProviderFailure } from '../packages/providers/src/contracts.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';
import { MetricsRegistry } from '../packages/telemetry/src/metrics.ts';
import { ResumableDealFlow } from '../packages/workflows/src/resumable-deal-flow.ts';
import { WorkerRunner, type OutboxPublisher } from '../apps/worker/src/runner.ts';

export const EVALUATION_CASE_NAMES = [
  'happy path',
  'unqualified lead',
  'missing mortgage fact',
  'enrichment transient failure/retry',
  'seller exception/resume',
  'no eligible buyer',
  'duplicate run/idempotency',
  'document tamper detection',
  'source duplicate suppression',
  'outbox exactly-once publication',
] as const;

export type EvaluationCaseName = typeof EVALUATION_CASE_NAMES[number];

export interface EvaluationCaseResult {
  name: EvaluationCaseName;
  passed: boolean;
  observedTerminalState: string;
  eventSequence: string[];
  providerOperations: string[];
  invariantFailures: string[];
  durationMs: number;
}

interface Observation {
  observedTerminalState: string;
  eventSequence: string[];
  providerOperations: string[];
  invariantFailures: string[];
}

interface EvaluationCase {
  name: EvaluationCaseName;
  run(): Promise<Observation>;
}

function invariant(failures: string[], condition: unknown, message: string): void {
  if (!condition) failures.push(message);
}

function createWorkflow(
  runtime: Clock & IdSource,
  store: InMemoryDealFlowStore,
  overrides: { enrichment?: EnrichmentProvider; seller?: SellerConversationProvider } = {},
): ResumableDealFlow {
  return new ResumableDealFlow({
    runtime,
    store,
    enrichment: overrides.enrichment ?? new SimulatedEnrichmentProvider(),
    seller: overrides.seller ?? new SimulatedSellerConversationProvider(),
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  });
}

async function workflowObservation(store: InMemoryDealFlowStore, workflowId: string, failures: string[]): Promise<Observation> {
  const checkpoint = await store.loadCheckpoint(workflowId);
  return {
    observedTerminalState: checkpoint?.state ?? 'MISSING',
    eventSequence: (await store.listEvents(workflowId)).map((event) => event.eventType),
    providerOperations: (await store.listProviderCalls(workflowId)).map((call) => call.operation),
    invariantFailures: failures,
  };
}

class FailOnceEnrichment implements EnrichmentProvider {
  readonly name = 'fail-once-enrichment';
  private failed = false;
  private readonly delegate = new SimulatedEnrichmentProvider();

  async enrich(property: Property, runtime: Runtime, correlationId: string): Promise<ProviderResult<EnrichmentRun>> {
    if (!this.failed) {
      this.failed = true;
      throw new ProviderFailure(this.name, 'enrich', 'synthetic transient enrichment failure', { retryable: true, statusCode: 503 });
    }
    return this.delegate.enrich(property, runtime, correlationId);
  }
}

class FailOnceSeller implements SellerConversationProvider {
  readonly name = 'fail-once-seller';
  private failed = false;
  private readonly delegate = new SimulatedSellerConversationProvider();

  async converse(property: Property, enrichment: EnrichmentRun, runtime: Runtime, correlationId: string): Promise<ProviderResult<SellerConversationResult>> {
    if (!this.failed) {
      this.failed = true;
      throw new ProviderFailure(this.name, 'converse', 'synthetic transient seller failure', { retryable: true, statusCode: 503 });
    }
    return this.delegate.converse(property, enrichment, runtime, correlationId);
  }
}

class RecordingPublisher implements OutboxPublisher {
  readonly records: OutboxRecord[] = [];
  async publish(record: OutboxRecord): Promise<void> { this.records.push(record); }
}

const cases: EvaluationCase[] = [
  {
    name: 'happy path',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:00:00.000Z');
      const store = new InMemoryDealFlowStore();
      const workflow = createWorkflow(runtime, store);
      const started = await workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
      const completed = await workflow.runToTerminal(started.workflowId);
      const events = await store.listEvents(started.workflowId);
      const calls = await store.listProviderCalls(started.workflowId);
      invariant(failures, completed.state === 'ARCHIVED', 'workflow did not archive');
      invariant(failures, events.length === 14, `expected 14 events, observed ${events.length}`);
      invariant(failures, calls.length === 6, `expected 6 provider calls, observed ${calls.length}`);
      return workflowObservation(store, started.workflowId, failures);
    },
  },
  {
    name: 'unqualified lead',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:01:00.000Z');
      const store = new InMemoryDealFlowStore();
      const workflow = createWorkflow(runtime, store);
      const source = {
        ...syntheticPropertySource,
        ownerMailingState: 'MA',
        estimatedMortgageBalanceCents: 29_500_000,
        vacancyIndicator: false,
        distressIndicator: false,
      };
      const started = await workflow.start({ source, buyers: syntheticBuyers });
      try { await workflow.runToTerminal(started.workflowId); } catch { /* expected */ }
      const observation = await workflowObservation(store, started.workflowId, failures);
      invariant(failures, observation.observedTerminalState === 'EXCEPTION', 'unqualified lead did not stop in EXCEPTION');
      invariant(failures, observation.eventSequence.length === 1 && observation.eventSequence[0] === 'PropertyIngested', 'unqualified lead performed downstream work');
      return observation;
    },
  },
  {
    name: 'missing mortgage fact',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:02:00.000Z');
      const store = new InMemoryDealFlowStore();
      const workflow = createWorkflow(runtime, store);
      const { estimatedMortgageBalanceCents: _unknown, ...source } = syntheticPropertySource;
      const started = await workflow.start({ source, buyers: syntheticBuyers });
      await workflow.runToTerminal(started.workflowId);
      const checkpoint = await store.loadCheckpoint(started.workflowId);
      const context = checkpoint?.context as { leadScore?: { total: number; components: { equityProxy: number } } } | undefined;
      invariant(failures, checkpoint?.state === 'ARCHIVED', 'missing mortgage fact prevented otherwise qualified workflow');
      invariant(failures, context?.leadScore?.components.equityProxy === 0, 'missing mortgage fact invented equity points');
      invariant(failures, context?.leadScore?.total === 65, `expected unknown-aware score 65, observed ${context?.leadScore?.total}`);
      return workflowObservation(store, started.workflowId, failures);
    },
  },
  {
    name: 'enrichment transient failure/retry',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:03:00.000Z');
      const store = new InMemoryDealFlowStore();
      const failing = createWorkflow(runtime, store, { enrichment: new FailOnceEnrichment() });
      const started = await failing.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
      try { await failing.runToTerminal(started.workflowId); } catch { /* expected */ }
      const failed = await store.loadCheckpoint(started.workflowId);
      invariant(failures, failed?.state === 'EXCEPTION' && failed.failure?.stage === 'QUALIFIED', 'transient enrichment failure was not checkpointed at QUALIFIED');
      const resumed = createWorkflow(runtime, store);
      await resumed.resume(started.workflowId);
      const events = await store.listEvents(started.workflowId);
      invariant(failures, events.filter((event) => event.eventType === 'PropertyIngested').length === 1, 'resume duplicated PropertyIngested');
      invariant(failures, events.filter((event) => event.eventType === 'LeadQualified').length === 1, 'resume duplicated LeadQualified');
      return workflowObservation(store, started.workflowId, failures);
    },
  },
  {
    name: 'seller exception/resume',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:04:00.000Z');
      const store = new InMemoryDealFlowStore();
      const failing = createWorkflow(runtime, store, { seller: new FailOnceSeller() });
      const started = await failing.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
      try { await failing.runToTerminal(started.workflowId); } catch { /* expected */ }
      const failed = await store.loadCheckpoint(started.workflowId);
      invariant(failures, failed?.state === 'EXCEPTION' && failed.failure?.stage === 'SELLER_ENGAGED', 'seller failure was not checkpointed at SELLER_ENGAGED');
      const before = await store.listEvents(started.workflowId);
      await createWorkflow(runtime, store).resume(started.workflowId);
      const after = await store.listEvents(started.workflowId);
      invariant(failures, after.filter((event) => event.eventType === 'OutreachStarted').length === 1, 'resume duplicated outreach start');
      invariant(failures, after.length > before.length, 'resume did not continue downstream');
      return workflowObservation(store, started.workflowId, failures);
    },
  },
  {
    name: 'no eligible buyer',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:05:00.000Z');
      const store = new InMemoryDealFlowStore();
      const workflow = createWorkflow(runtime, store);
      const started = await workflow.start({ source: syntheticPropertySource, buyers: [] });
      try { await workflow.runToTerminal(started.workflowId); } catch { /* expected */ }
      const observation = await workflowObservation(store, started.workflowId, failures);
      const checkpoint = await store.loadCheckpoint(started.workflowId);
      invariant(failures, checkpoint?.state === 'EXCEPTION' && checkpoint.failure?.stage === 'ACQUISITION_EXECUTED', 'no-buyer workflow did not fail after acquisition execution');
      invariant(failures, !observation.eventSequence.includes('BuyerSelected'), 'no-buyer workflow selected a buyer');
      invariant(failures, !observation.eventSequence.includes('AssignmentExecuted'), 'no-buyer workflow executed an assignment');
      return observation;
    },
  },
  {
    name: 'duplicate run/idempotency',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:06:00.000Z');
      const store = new InMemoryDealFlowStore();
      const workflow = createWorkflow(runtime, store);
      const started = await workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
      const first = await workflow.runToTerminal(started.workflowId);
      const firstEvents = await store.listEvents(started.workflowId);
      const firstCalls = await store.listProviderCalls(started.workflowId);
      const second = await workflow.runToTerminal(started.workflowId);
      invariant(failures, first.id === second.id, 'duplicate terminal run returned a different transaction');
      invariant(failures, (await store.listEvents(started.workflowId)).length === firstEvents.length, 'duplicate terminal run added events');
      invariant(failures, (await store.listProviderCalls(started.workflowId)).length === firstCalls.length, 'duplicate terminal run added provider calls');
      return workflowObservation(store, started.workflowId, failures);
    },
  },
  {
    name: 'document tamper detection',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const template = {
        id: 'assignment-v1',
        version: '1.0.0',
        subjectType: 'assignment' as const,
        mimeType: 'text/plain' as const,
        content: 'Buyer: {{buyer}}\nAssignment: {{money:assignmentPriceCents}}\n',
      };
      const artifact = renderDocument(template, {
        subjectId: 'assignment-1',
        createdAt: '2026-08-11T20:07:00.000Z',
        inputs: { buyer: 'Synthetic Buyer', assignmentPriceCents: 25_000_000 },
      });
      const envelope = createSignatureEnvelope(artifact, '2026-08-11T20:07:00.000Z');
      const tampered: DocumentArtifact = { ...artifact, content: `${artifact.content}tampered` };
      invariant(failures, verifyArtifact(artifact), 'valid document artifact failed verification');
      invariant(failures, verifyEnvelopeArtifact(envelope, artifact), 'valid envelope binding failed verification');
      invariant(failures, !verifyArtifact(tampered), 'tampered artifact passed verification');
      invariant(failures, !verifyEnvelopeArtifact(envelope, tampered), 'envelope accepted tampered artifact');
      return { observedTerminalState: 'ARTIFACT_VERIFIED', eventSequence: [], providerOperations: [], invariantFailures: failures };
    },
  },
  {
    name: 'source duplicate suppression',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:08:00.000Z');
      const store = new InMemorySourceStateStore();
      const runner = new SourceIngestionRunner(store, runtime);
      const provider: SourceProvider = {
        sourceId: 'synthetic-source',
        async fetchPage() { return { records: [syntheticPropertySource] }; },
      };
      const first = await runner.run(provider);
      const second = await runner.run(provider);
      invariant(failures, first.newSnapshotCount === 1, 'first source run did not persist one snapshot');
      invariant(failures, second.newSnapshotCount === 0 && second.duplicateSnapshotCount === 1, 'second source run did not suppress duplicate snapshot');
      invariant(failures, (await store.listSnapshots(provider.sourceId)).length === 1, 'duplicate snapshot was persisted');
      return { observedTerminalState: second.health.status.toUpperCase(), eventSequence: [], providerOperations: ['fetchPage', 'fetchPage'], invariantFailures: failures };
    },
  },
  {
    name: 'outbox exactly-once publication',
    async run(): Promise<Observation> {
      const failures: string[] = [];
      const runtime = new DeterministicRuntime('2026-08-11T20:09:00.000Z');
      const store = new InMemoryDealFlowStore();
      const workflow = createWorkflow(runtime, store);
      const started = await workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
      await workflow.runToTerminal(started.workflowId);
      const publisher = new RecordingPublisher();
      const worker = new WorkerRunner({
        runtime,
        store,
        workflow,
        metrics: new MetricsRegistry(),
        publisher,
        workerId: 'eval-outbox-worker',
        outboxBatchSize: 100,
      });
      const first = await worker.drainOutbox();
      const second = await worker.drainOutbox();
      invariant(failures, first.published === 14, `expected 14 published events, observed ${first.published}`);
      invariant(failures, second.published === 0, 'second drain republished outbox events');
      invariant(failures, new Set(publisher.records.map((record) => record.dedupeKey)).size === publisher.records.length, 'publisher observed duplicate dedupe keys');
      const observation = await workflowObservation(store, started.workflowId, failures);
      observation.providerOperations.push('outbox.publish');
      return observation;
    },
  },
];

export async function runEvaluationCases(): Promise<EvaluationCaseResult[]> {
  const results: EvaluationCaseResult[] = [];
  for (const evaluation of cases) {
    const startedAt = Date.now();
    try {
      const observation = await evaluation.run();
      results.push({
        name: evaluation.name,
        passed: observation.invariantFailures.length === 0,
        observedTerminalState: observation.observedTerminalState,
        eventSequence: observation.eventSequence,
        providerOperations: observation.providerOperations,
        invariantFailures: observation.invariantFailures,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        name: evaluation.name,
        passed: false,
        observedTerminalState: 'UNEXPECTED_ERROR',
        eventSequence: [],
        providerOperations: [],
        invariantFailures: [error instanceof Error ? error.message : String(error)],
        durationMs: Date.now() - startedAt,
      });
    }
  }
  return results;
}
