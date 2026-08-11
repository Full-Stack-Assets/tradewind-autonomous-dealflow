import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { InMemoryEventStore } from '../packages/events/src/event-store.ts';
import type { SellerConversationProvider } from '../packages/providers/src/contracts.ts';
import { ProviderFailure } from '../packages/providers/src/contracts.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';
import { DealFlowWorkflow, WorkflowException } from '../packages/workflows/src/deal-flow-workflow.ts';

const failingSeller: SellerConversationProvider = {
  name: 'failing-seller',
  async converse() {
    throw new ProviderFailure('failing-seller', 'converse', 'synthetic provider failure');
  },
};

test('moves to EXCEPTION and stops downstream work on provider failure', async () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const events = new InMemoryEventStore();
  const workflow = new DealFlowWorkflow({
    runtime,
    events,
    enrichment: new SimulatedEnrichmentProvider(),
    seller: failingSeller,
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  });

  await assert.rejects(
    () => workflow.run(syntheticPropertySource, syntheticBuyers),
    (error) => error instanceof WorkflowException && error.stage === 'SELLER_ENGAGED',
  );
  assert.equal(workflow.getState(), 'EXCEPTION');
  assert.equal(workflow.getException()?.message, 'synthetic provider failure');
  assert.deepEqual(events.all().map((event) => event.eventType), [
    'PropertyIngested', 'LeadQualified', 'EnrichmentCompleted', 'OutreachStarted',
  ]);
});
