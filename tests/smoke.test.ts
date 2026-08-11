import assert from 'node:assert/strict';
import test from 'node:test';
import { runSmoke } from '../apps/worker/src/smoke.ts';

test('offline smoke returns an archived transaction summary', async () => {
  const summary = await runSmoke();
  assert.equal(summary.state, 'ARCHIVED');
  assert.equal(summary.buyerId, 'buyer-001');
  assert.equal(summary.assignmentFeeCents, 2_000_000);
  assert.equal(summary.closingStatus, 'confirmed');
  assert.equal(summary.eventCount, 14);
  assert.ok(summary.workflowId.startsWith('workflow-'));
  assert.ok(summary.propertyId.startsWith('property-'));
});
