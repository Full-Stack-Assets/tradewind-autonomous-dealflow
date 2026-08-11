import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { normalizeProperty } from '../packages/domain/src/normalize.ts';
import type { NegotiatedDeal } from '../packages/domain/src/types.ts';
import { matchBuyers } from '../packages/matching/src/match-buyers.ts';

test('filters incompatible buyers before ranking', () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const property = normalizeProperty(syntheticPropertySource, runtime);
  const deal: NegotiatedDeal = {
    id: 'deal-test', schemaVersion: '1', createdAt: runtime.now(), propertyId: property.id,
    sellerIdentityId: 'owner-test', acquisitionPriceCents: 23_000_000,
    assignmentPriceCents: 25_000_000, strategy: 'wholesale', accepted: true,
  };
  const matches = matchBuyers(property, deal, syntheticBuyers);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]!.buyerId, 'buyer-001');
  assert.ok(matches[0]!.fitScore > 0);
});
