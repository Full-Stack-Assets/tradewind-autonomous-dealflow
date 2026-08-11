import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { createApplicationContext } from '../packages/runtime/src/application.ts';

test('creates a fully executable simulated in-memory application context without credentials', async () => {
  const context = await createApplicationContext({});
  try {
    assert.equal(context.persistenceMode, 'memory');
    assert.equal(context.providerMode, 'simulated');
    const started = await context.workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
    const completed = await context.workflow.runToTerminal(started.workflowId);
    assert.equal(completed.workflowId, started.workflowId);
    assert.equal((await context.store.loadCheckpoint(started.workflowId))?.state, 'ARCHIVED');
    assert.equal((await context.readiness()).ready, true);
  } finally {
    await context.close();
  }
});

test('rejects incomplete live provider configuration before any network request', async () => {
  await assert.rejects(
    () => createApplicationContext({ TRADEWIND_PROVIDER_MODE: 'live' }),
    /OPENAI_API_KEY.*required/,
  );
});
