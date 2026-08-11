import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticPropertySource, syntheticBuyers } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { normalizeProperty } from '../packages/domain/src/normalize.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';

test('deterministic providers return structured lifecycle results', async () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const property = normalizeProperty(syntheticPropertySource, runtime);
  const enrichment = await new SimulatedEnrichmentProvider().enrich(property, runtime, 'w1');
  assert.equal(enrichment.data.owner.displayName, 'Synthetic Seller');
  assert.equal(enrichment.call.status, 'success');

  const seller = await new SimulatedSellerConversationProvider().converse(property, enrichment.data, runtime, 'w1');
  assert.equal(seller.data.deal.accepted, true);
  assert.equal(seller.data.deal.acquisitionPriceCents, 23_000_000);
  assert.equal(seller.data.deal.assignmentPriceCents, 25_000_000);

  const signature = await new SimulatedSignatureProvider().execute('acquisition', seller.data.deal.id, runtime, 'w1');
  assert.equal(signature.data.status, 'executed');

  const buyer = await new SimulatedBuyerOutreachProvider().selectBuyer([{ buyerId: syntheticBuyers[0]!.id, fitScore: 95, reasons: ['eligible'] }], runtime, 'w1');
  assert.equal(buyer.data.buyerId, 'buyer-001');

  const closing = await new SimulatedClosingProvider().confirmClosing('assignment-0001', runtime, 'w1');
  assert.equal(closing.data.status, 'confirmed');
});
