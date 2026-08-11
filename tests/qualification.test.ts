import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { normalizeProperty } from '../packages/domain/src/normalize.ts';
import { scoreLead } from '../packages/domain/src/scoring.ts';

test('normalizes synthetic MA source with lineage and integer-cent money', () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const property = normalizeProperty(syntheticPropertySource, runtime);
  assert.equal(property.state, 'MA');
  assert.equal(property.assessedValueCents, 30000000);
  assert.equal(property.lineage.sourceId, 'synthetic-ma-001');
  assert.equal(property.lineage.synthetic, true);
});

test('scores the synthetic lead deterministically', () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const property = normalizeProperty(syntheticPropertySource, runtime);
  const score = scoreLead(property);
  assert.equal(score.total, 100);
  assert.equal(score.qualified, true);
  assert.deepEqual(score.components, {
    equityProxy: 35,
    absenteeOwner: 20,
    vacancyDistress: 30,
    targetState: 15,
  });
});
