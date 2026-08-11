import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';

test('produces stable ids and timestamps', () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  assert.equal(runtime.nextId('property'), 'property-0001');
  assert.equal(runtime.nextId('property'), 'property-0002');
  assert.equal(runtime.now(), '2026-08-11T16:00:00.000Z');
});
