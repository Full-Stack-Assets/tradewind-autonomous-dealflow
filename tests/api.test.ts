import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { createApiServer, BadRequestError } from '../apps/api/src/server.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { InMemoryDealFlowStore } from '../packages/persistence/src/in-memory-store.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../packages/providers/src/simulators.ts';
import { MetricsRegistry } from '../packages/telemetry/src/metrics.ts';
import { ResumableDealFlow } from '../packages/workflows/src/resumable-deal-flow.ts';

function createSystem() {
  const runtime = new DeterministicRuntime('2026-08-11T18:00:00.000Z');
  const store = new InMemoryDealFlowStore();
  const metrics = new MetricsRegistry();
  const workflow = new ResumableDealFlow({
    runtime,
    store,
    enrichment: new SimulatedEnrichmentProvider(),
    seller: new SimulatedSellerConversationProvider(),
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  });
  return { runtime, store, metrics, workflow };
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

test('serves health, readiness, operator HTML, simulations, workflow data, events, sources, and metrics', async () => {
  const system = createSystem();
  let ready = false;
  const server = createApiServer({
    store: system.store,
    metrics: system.metrics,
    maxRequestBytes: 256,
    readiness: async () => ({ ready, checks: { persistence: ready ? 'ok' : 'unavailable' } }),
    listSourceHealth: async () => [{ sourceId: 'massgis-level3', status: 'healthy', consecutiveFailures: 0 }],
    createSimulation: async (input) => {
      if (input.mode !== 'synthetic') throw new BadRequestError('mode must be synthetic');
      const checkpoint = await system.workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
      system.metrics.increment('workflow.started');
      const completed = await system.workflow.runToTerminal(checkpoint.workflowId);
      const terminal = await system.store.loadCheckpoint(checkpoint.workflowId);
      if (terminal) system.metrics.setWorkflowState(terminal.workflowId, terminal.state, terminal.status);
      return { workflowId: checkpoint.workflowId, completedTransactionId: completed.id, state: completed.state };
    },
  });
  const { url } = await server.listen(0, '127.0.0.1');
  try {
    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 200);
    assert.ok(health.headers.get('content-type')?.startsWith('application/json'));
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await json(health), { status: 'ok', service: 'tradewind-autonomous-dealflow' });

    const notReady = await fetch(`${url}/ready`);
    assert.equal(notReady.status, 503);
    ready = true;
    const readyResponse = await fetch(`${url}/ready`);
    assert.equal(readyResponse.status, 200);
    assert.deepEqual(await json(readyResponse), { ready: true, checks: { persistence: 'ok' } });

    const home = await fetch(url);
    assert.equal(home.status, 200);
    assert.ok(home.headers.get('content-type')?.startsWith('text/html'));
    const html = await home.text();
    assert.ok(html.includes('Lifecycle'));
    assert.ok(html.includes('Source health'));
    assert.ok(html.includes('Exceptions'));

    const before = await fetch(`${url}/v1/workflows`);
    assert.deepEqual(await json(before), { workflows: [] });

    const invalidJson = await fetch(`${url}/v1/simulations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(invalidJson.status, 400);
    assert.deepEqual(await json(invalidJson), { error: { code: 'bad_request', message: 'Request body must be valid JSON' } });

    const invalidMode = await fetch(`${url}/v1/simulations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'live' }),
    });
    assert.equal(invalidMode.status, 400);

    const oversized = await fetch(`${url}/v1/simulations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'synthetic', padding: 'x'.repeat(300) }),
    });
    assert.equal(oversized.status, 413);

    const created = await fetch(`${url}/v1/simulations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'synthetic' }),
    });
    assert.equal(created.status, 201);
    const createdBody = await json(created) as { workflowId: string; state: string };
    assert.equal(createdBody.state, 'ARCHIVED');

    const workflows = await json(await fetch(`${url}/v1/workflows`)) as { workflows: Array<{ workflowId: string; state: string }> };
    assert.equal(workflows.workflows.length, 1);
    assert.equal(workflows.workflows[0]?.state, 'ARCHIVED');

    const workflow = await json(await fetch(`${url}/v1/workflows/${createdBody.workflowId}`)) as { workflow: { workflowId: string }; completedTransaction: { state: string } };
    assert.equal(workflow.workflow.workflowId, createdBody.workflowId);
    assert.equal(workflow.completedTransaction.state, 'ARCHIVED');

    const events = await json(await fetch(`${url}/v1/events?workflowId=${createdBody.workflowId}`)) as { events: unknown[] };
    assert.equal(events.events.length, 14);

    const sources = await json(await fetch(`${url}/v1/sources`));
    assert.deepEqual(sources, { sources: [{ sourceId: 'massgis-level3', status: 'healthy', consecutiveFailures: 0 }] });

    const metrics = await json(await fetch(`${url}/v1/metrics`)) as { metrics: { counters: Record<string, number> } };
    assert.equal(metrics.metrics.counters['workflow.started'], 1);

    const notFound = await fetch(`${url}/v1/workflows/missing`);
    assert.equal(notFound.status, 404);
  } finally {
    await server.close();
  }
});

test('protects v1 routes with an optional bearer token while leaving health endpoints accessible', async () => {
  const system = createSystem();
  const server = createApiServer({
    store: system.store,
    metrics: system.metrics,
    apiToken: 'api-token',
    createSimulation: async () => ({ state: 'ARCHIVED' }),
  });
  const { url } = await server.listen(0, '127.0.0.1');
  try {
    assert.equal((await fetch(`${url}/health`)).status, 200);
    assert.equal((await fetch(`${url}/v1/workflows`)).status, 401);
    const authorized = await fetch(`${url}/v1/workflows`, { headers: { authorization: 'Bearer api-token' } });
    assert.equal(authorized.status, 200);
  } finally {
    await server.close();
  }
});
