import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { createApiServer } from '../apps/api/src/server.ts';
import { WorkerRunner, type OutboxPublisher } from '../apps/worker/src/runner.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import type { DocumentTemplate, NegotiatedDeal, Property } from '../packages/domain/src/types.ts';
import { createSignatureEnvelope, renderDocument, verifyEnvelopeArtifact } from '../packages/documents/src/render.ts';
import {
  InMemorySourceStateStore,
  SourceIngestionRunner,
  type SourceProvider,
} from '../packages/ingestion/src/source-runner.ts';
import type { OutboxRecord } from '../packages/persistence/src/contracts.ts';
import { InMemoryDealFlowStore } from '../packages/persistence/src/in-memory-store.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';
import { MetricsRegistry } from '../packages/telemetry/src/metrics.ts';
import { AutonomousDealFlowSystem } from '../packages/workflows/src/autonomous-system.ts';
import { ResumableDealFlow } from '../packages/workflows/src/resumable-deal-flow.ts';

class RecordingPublisher implements OutboxPublisher {
  readonly records: OutboxRecord[] = [];
  async publish(record: OutboxRecord): Promise<void> { this.records.push(record); }
}

test('runs official-source-shaped ingestion through persistence, workflow, documents, worker, API, and archival', async () => {
  const runtime = new DeterministicRuntime('2026-08-11T21:00:00.000Z');
  const sourceStore = new InMemorySourceStateStore();
  const sourceRunner = new SourceIngestionRunner(sourceStore, runtime);
  const store = new InMemoryDealFlowStore();
  const metrics = new MetricsRegistry();
  const workflow = new ResumableDealFlow({
    runtime,
    store,
    enrichment: new SimulatedEnrichmentProvider(),
    seller: new SimulatedSellerConversationProvider(),
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  });
  const system = new AutonomousDealFlowSystem({ sourceRunner, workflow, buyers: syntheticBuyers, metrics });
  const sourceProvider: SourceProvider = {
    sourceId: 'massgis-level3-fixture',
    async fetchPage() {
      return {
        records: [{
          ...syntheticPropertySource,
          sourceId: 'massgis-level3-fixture',
          sourceType: 'massgis_level3_arcgis_fixture',
          sourceRecordId: 'M_001_000001',
          sourceUrl: 'https://example.test/official-source-fixture',
          sourceItemId: '73d4c766167848b795f1048cad3919c7',
          synthetic: true,
        }],
      };
    },
  };

  const started = await system.ingestAndStart(sourceProvider);
  assert.equal(started.ingestion.newSnapshotCount, 1);
  assert.equal(started.workflowIds.length, 1);

  const publisher = new RecordingPublisher();
  const worker = new WorkerRunner({
    runtime,
    store,
    workflow,
    metrics,
    publisher,
    workerId: 'full-system-worker',
    outboxBatchSize: 100,
  });
  const tick = await worker.tick();
  assert.equal(tick.completedWorkflows, 1);
  assert.equal(tick.publishedOutbox, 14);

  const workflowId = started.workflowIds[0]!;
  const completed = await store.loadCompletedTransaction(workflowId);
  const checkpoint = await store.loadCheckpoint(workflowId);
  assert.equal(completed?.state, 'ARCHIVED');
  assert.equal(checkpoint?.state, 'ARCHIVED');
  assert.equal((await store.listEvents(workflowId)).length, 14);
  assert.ok((await store.listOutbox(workflowId)).every((record) => record.status === 'published'));

  const context = checkpoint?.context as { property: Property; deal: NegotiatedDeal; selectedBuyerId: string };
  const acquisitionTemplate: DocumentTemplate = {
    id: 'acquisition-v1',
    version: '1.0.0',
    subjectType: 'acquisition',
    mimeType: 'text/plain',
    content: await readFile(new URL('../packages/documents/templates/acquisition-v1.txt', import.meta.url), 'utf8'),
  };
  const acquisitionArtifact = renderDocument(acquisitionTemplate, {
    subjectId: context.deal.id,
    createdAt: runtime.now(),
    inputs: {
      propertyAddress: `${context.property.address1}, ${context.property.city}, ${context.property.state}`,
      sellerName: context.property.ownerName,
      purchasePriceCents: context.deal.acquisitionPriceCents,
      closingDate: '2026-09-01',
    },
  });
  const acquisitionEnvelope = createSignatureEnvelope(acquisitionArtifact, runtime.now());
  assert.equal(verifyEnvelopeArtifact(acquisitionEnvelope, acquisitionArtifact), true);

  const assignmentTemplate: DocumentTemplate = {
    id: 'assignment-v1',
    version: '1.0.0',
    subjectType: 'assignment',
    mimeType: 'text/plain',
    content: await readFile(new URL('../packages/documents/templates/assignment-v1.txt', import.meta.url), 'utf8'),
  };
  const assignmentArtifact = renderDocument(assignmentTemplate, {
    subjectId: completed!.assignmentId,
    createdAt: runtime.now(),
    inputs: {
      propertyAddress: `${context.property.address1}, ${context.property.city}, ${context.property.state}`,
      assignorName: 'Tradewind Synthetic Assignor',
      assigneeName: context.selectedBuyerId,
      assignmentPriceCents: context.deal.assignmentPriceCents,
    },
  });
  assert.equal(verifyEnvelopeArtifact(createSignatureEnvelope(assignmentArtifact, runtime.now()), assignmentArtifact), true);

  const api = createApiServer({
    store,
    metrics,
    createSimulation: async () => ({ error: 'not used in acceptance test' }),
    listSourceHealth: async () => {
      const health = await sourceStore.loadHealth(sourceProvider.sourceId);
      return health ? [health] : [];
    },
  });
  const { url } = await api.listen();
  try {
    const workflowReadback = await fetch(`${url}/v1/workflows/${workflowId}`);
    assert.equal(workflowReadback.status, 200);
    const body = await workflowReadback.json() as { completedTransaction: { id: string } };
    assert.equal(body.completedTransaction.id, completed?.id);
    const sources = await (await fetch(`${url}/v1/sources`)).json() as { sources: Array<{ status: string }> };
    assert.equal(sources.sources[0]?.status, 'healthy');
    const metricBody = await (await fetch(`${url}/v1/metrics`)).json() as { metrics: { counters: Record<string, number> } };
    assert.equal(metricBody.metrics.counters['worker.workflows.completed'], 1);
  } finally {
    await api.close();
  }
});
