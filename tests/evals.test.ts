import assert from 'node:assert/strict';
import test from 'node:test';
import { EVALUATION_CASE_NAMES } from '../evals/cases.ts';
import { runEvaluations } from '../evals/run.ts';

const required = [
  'happy path',
  'unqualified lead',
  'missing mortgage fact',
  'enrichment transient failure/retry',
  'seller exception/resume',
  'no eligible buyer',
  'duplicate run/idempotency',
  'document tamper detection',
  'source duplicate suppression',
  'outbox exactly-once publication',
];

test('defines and passes the complete autonomous behavior evaluation matrix', async () => {
  assert.deepEqual(EVALUATION_CASE_NAMES, required);
  const report = await runEvaluations({ writeResults: false });
  assert.equal(report.caseCount, required.length);
  assert.equal(report.passedCount, required.length);
  assert.equal(report.failedCount, 0);
  assert.equal(report.passed, true);
  assert.deepEqual(report.results.map((result) => result.name), required);
  for (const result of report.results) {
    assert.equal(result.passed, true, `${result.name}: ${result.invariantFailures.join('; ')}`);
    assert.ok(result.durationMs >= 0);
    assert.ok(Array.isArray(result.eventSequence));
    assert.ok(Array.isArray(result.providerOperations));
  }
});
