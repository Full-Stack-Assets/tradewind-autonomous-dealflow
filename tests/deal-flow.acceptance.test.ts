import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { InMemoryEventStore } from '../packages/events/src/event-store.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';
import { DealFlowWorkflow } from '../packages/workflows/src/deal-flow-workflow.ts';

const expectedEvents = [
  'PropertyIngested', 'LeadQualified', 'EnrichmentCompleted', 'OutreachStarted',
  'SellerQualified', 'OfferGenerated', 'TermsAccepted', 'AcquisitionExecuted',
  'BuyersMatched', 'BuyerSelected', 'AssignmentExecuted', 'ClosingConfirmed',
  'FeeRecorded', 'DealArchived',
];

test('runs the complete deterministic deal lifecycle and archives the transaction', async () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const events = new InMemoryEventStore();
  const workflow = new DealFlowWorkflow({
    runtime,
    events,
    enrichment: new SimulatedEnrichmentProvider(),
    seller: new SimulatedSellerConversationProvider(),
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  });

  const completed = await workflow.run(syntheticPropertySource, syntheticBuyers);

  assert.equal(workflow.getState(), 'ARCHIVED');
  assert.equal(completed.state, 'ARCHIVED');
  assert.equal(completed.buyerId, 'buyer-001');
  assert.equal(completed.assignmentFeeCents, 2_000_000);
  assert.equal(completed.eventIds.length, 14);
  assert.equal(completed.providerCallIds.length, 6);
  assert.deepEqual(events.all().map((event) => event.eventType), expectedEvents);
});
