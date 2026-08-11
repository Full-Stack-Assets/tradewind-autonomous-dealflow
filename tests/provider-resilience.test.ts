import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderFailure } from '../packages/providers/src/contracts.ts';
import {
  CircuitBreaker,
  InMemoryIdempotencyStore,
  withRetry,
} from '../packages/providers/src/resilience.ts';

test('retries transient failures but not permanent failures', async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new ProviderFailure('test', 'run', 'temporary', { retryable: true, statusCode: 503 });
    }
    return 'ok';
  }, { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0 });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);

  let permanentAttempts = 0;
  await assert.rejects(
    () => withRetry(async () => {
      permanentAttempts += 1;
      throw new ProviderFailure('test', 'run', 'invalid', { retryable: false, statusCode: 400 });
    }, { maxAttempts: 4, initialDelayMs: 0, maxDelayMs: 0 }),
    /invalid/,
  );
  assert.equal(permanentAttempts, 1);
});

test('opens, probes half-open, and closes a circuit breaker', async () => {
  let now = 0;
  let calls = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 2, resetAfterMs: 1000, now: () => now });
  const fail = async () => {
    calls += 1;
    throw new Error('down');
  };

  await assert.rejects(() => breaker.execute(fail), /down/);
  await assert.rejects(() => breaker.execute(fail), /down/);
  assert.equal(breaker.snapshot().state, 'open');
  await assert.rejects(() => breaker.execute(fail), /Circuit is open/);
  assert.equal(calls, 2);

  now = 1000;
  const recovered = await breaker.execute(async () => {
    calls += 1;
    return 'recovered';
  });
  assert.equal(recovered, 'recovered');
  assert.equal(breaker.snapshot().state, 'closed');
});

test('returns the original result for duplicate idempotency keys', async () => {
  const store = new InMemoryIdempotencyStore();
  let calls = 0;
  const first = await store.execute('same-key', async () => ({ value: ++calls }));
  const second = await store.execute('same-key', async () => ({ value: ++calls }));
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});
