import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { InMemoryDealFlowStore } from '../packages/persistence/src/in-memory-store.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';
import { ResumableDealFlow } from '../packages/workflows/src/resumable-deal-flow.ts';

test('returns the same terminal result without duplicating events or provider calls', async () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const store = new InMemoryDealFlowStore();
  const workflow = new ResumableDealFlow({
    runtime,
    store,
    enrichment: new SimulatedEnrichmentProvider(),
    seller: new SimulatedSellerConversationProvider(),
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  });
  const started = await workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });

  const first = await workflow.runToTerminal(started.workflowId);
  const eventCount = (await store.listEvents(started.workflowId)).length;
  const providerCallCount = (await store.listProviderCalls(started.workflowId)).length;
  const second = await workflow.runToTerminal(started.workflowId);

  assert.deepEqual(second, first);
  assert.equal((await store.listCompletedTransactions()).length, 1);
  assert.equal((await store.listEvents(started.workflowId)).length, eventCount);
  assert.equal((await store.listProviderCalls(started.workflowId)).length, providerCallCount);
  assert.equal(
    (await store.listEvents(started.workflowId)).filter((event) => event.eventType === 'DealArchived').length,
    1,
  );
});
