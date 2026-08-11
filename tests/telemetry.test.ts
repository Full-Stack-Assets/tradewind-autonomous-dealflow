import assert from 'node:assert/strict';
import test from 'node:test';
import { MetricsRegistry } from '../packages/telemetry/src/metrics.ts';

test('records counters, durations, workflow state, and source health in immutable snapshots', () => {
  const metrics = new MetricsRegistry();
  metrics.increment('workflow.started');
  metrics.increment('workflow.started', 2);
  metrics.observeDuration('provider.enrichment', 25);
  metrics.observeDuration('provider.enrichment', 75);
  metrics.setWorkflowState('workflow-1', 'ENRICHED', 'runnable');
  metrics.setSourceHealth('massgis-level3', 'healthy', 0);

  const first = metrics.snapshot();
  assert.equal(first.counters['workflow.started'], 3);
  assert.deepEqual(first.durations['provider.enrichment'], {
    count: 2,
    totalMs: 100,
    minMs: 25,
    maxMs: 75,
    averageMs: 50,
  });
  assert.deepEqual(first.workflows['workflow-1'], { state: 'ENRICHED', status: 'runnable' });
  assert.deepEqual(first.sources['massgis-level3'], { status: 'healthy', consecutiveFailures: 0 });

  assert.throws(() => {
    (first.counters as Record<string, number>)['workflow.started'] = 999;
  });
  assert.throws(() => {
    (first.sources['massgis-level3'] as { status: string }).status = 'failed';
  });
  assert.equal(metrics.snapshot().counters['workflow.started'], 3);
});

test('rejects invalid metric observations', () => {
  const metrics = new MetricsRegistry();
  assert.throws(() => metrics.increment('', 1), /name/);
  assert.throws(() => metrics.increment('count', -1), /non-negative/);
  assert.throws(() => metrics.observeDuration('latency', Number.NaN), /finite/);
});
