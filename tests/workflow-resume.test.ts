import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { InMemoryDealFlowStore } from '../packages/persistence/src/in-memory-store.ts';
import type { SellerConversationProvider } from '../packages/providers/src/contracts.ts';
import { ProviderFailure } from '../packages/providers/src/contracts.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';
import { ResumableDealFlow } from '../packages/workflows/src/resumable-deal-flow.ts';
import { WorkflowException } from '../packages/workflows/src/deal-flow-workflow.ts';

const failingSeller: SellerConversationProvider = {
  name: 'failing-seller',
  async converse() {
    throw new ProviderFailure('failing-seller', 'converse', 'temporary seller provider outage');
  },
};

function dependencies(runtime: DeterministicRuntime, store: InMemoryDealFlowStore, seller: SellerConversationProvider) {
  return {
    runtime,
    store,
    enrichment: new SimulatedEnrichmentProvider(),
    seller,
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  };
}

test('persists an exception and resumes without repeating completed stages', async () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const store = new InMemoryDealFlowStore();
  const first = new ResumableDealFlow(dependencies(runtime, store, failingSeller));
  const started = await first.start({ source: syntheticPropertySource, buyers: syntheticBuyers });

  await assert.rejects(
    () => first.runToTerminal(started.workflowId),
    (error) => error instanceof WorkflowException && error.stage === 'SELLER_ENGAGED',
  );

  const failed = await store.loadCheckpoint(started.workflowId);
  assert.equal(failed?.state, 'EXCEPTION');
  assert.equal(failed?.status, 'exception');
  assert.equal(failed?.failure?.stage, 'SELLER_ENGAGED');
  assert.equal(failed?.failure?.retryable, true);
  assert.deepEqual((await store.listEvents(started.workflowId)).map((event) => event.eventType), [
    'PropertyIngested',
    'LeadQualified',
    'EnrichmentCompleted',
    'OutreachStarted',
  ]);
  assert.deepEqual((await store.listProviderCalls(started.workflowId)).map((call) => call.operation), ['enrich']);

  const recovered = new ResumableDealFlow(
    dependencies(runtime, store, new SimulatedSellerConversationProvider()),
  );
  const completed = await recovered.resume(started.workflowId);

  assert.equal(completed.state, 'ARCHIVED');
  assert.equal((await store.loadCheckpoint(started.workflowId))?.status, 'completed');
  const eventTypes = (await store.listEvents(started.workflowId)).map((event) => event.eventType);
  assert.equal(eventTypes.filter((eventType) => eventType === 'PropertyIngested').length, 1);
  assert.equal(eventTypes.filter((eventType) => eventType === 'LeadQualified').length, 1);
  assert.equal(eventTypes.filter((eventType) => eventType === 'EnrichmentCompleted').length, 1);
  assert.equal(eventTypes.at(-1), 'DealArchived');
});
