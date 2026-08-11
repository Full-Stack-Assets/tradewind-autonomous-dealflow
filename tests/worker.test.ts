import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticBuyers, syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import type { Clock, IdSource } from '../packages/domain/src/clock.ts';
import type { OutboxRecord } from '../packages/persistence/src/contracts.ts';
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
import { WorkerRunner, type OutboxPublisher } from '../apps/worker/src/runner.ts';

class MutableRuntime implements Clock, IdSource {
  private instant: number;
  private readonly counters = new Map<string, number>();
  constructor(now: string) { this.instant = Date.parse(now); }
  now(): string { return new Date(this.instant).toISOString(); }
  advance(milliseconds: number): void { this.instant += milliseconds; }
  nextId(prefix: string): string {
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    return `${prefix}-${String(next).padStart(4, '0')}`;
  }
}

class RecordingPublisher implements OutboxPublisher {
  readonly records: OutboxRecord[] = [];
  async publish(record: OutboxRecord): Promise<void> {
    this.records.push(record);
  }
}

function setup() {
  const runtime = new MutableRuntime('2026-08-11T19:00:00.000Z');
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
  const publisher = new RecordingPublisher();
  const worker = new WorkerRunner({
    runtime,
    store,
    workflow,
    metrics,
    publisher,
    workerId: 'worker-a',
    workflowBatchSize: 10,
    outboxBatchSize: 100,
    leaseSeconds: 60,
  });
  return { runtime, store, metrics, workflow, publisher, worker };
}

test('claims only available workflows, resumes them, releases leases, and publishes each outbox row once', async () => {
  const system = setup();
  const first = await system.workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
  const second = await system.workflow.start({ source: { ...syntheticPropertySource, parcelId: 'SYNTH-0002' }, buyers: syntheticBuyers });

  const occupied = await system.store.claimRunnable(1, 'other-worker', 60, system.runtime.now());
  assert.equal(occupied.length, 1);
  assert.equal(occupied[0]?.workflowId, first.workflowId);

  const firstTick = await system.worker.tick();
  assert.equal(firstTick.claimedWorkflows, 1);
  assert.equal(firstTick.completedWorkflows, 1);
  assert.equal((await system.store.loadCheckpoint(first.workflowId))?.leaseOwner, 'other-worker');
  const completedSecond = await system.store.loadCheckpoint(second.workflowId);
  assert.equal(completedSecond?.state, 'ARCHIVED');
  assert.equal(completedSecond?.leaseOwner, undefined);
  assert.equal(firstTick.publishedOutbox, 15);

  const duplicateDrain = await system.worker.drainOutbox();
  assert.equal(duplicateDrain.published, 0);
  assert.equal(new Set(system.publisher.records.map((record) => record.dedupeKey)).size, system.publisher.records.length);

  system.runtime.advance(61_000);
  const secondTick = await system.worker.tick();
  assert.equal(secondTick.claimedWorkflows, 1);
  assert.equal(secondTick.completedWorkflows, 1);
  const completedFirst = await system.store.loadCheckpoint(first.workflowId);
  assert.equal(completedFirst?.state, 'ARCHIVED');
  assert.equal(completedFirst?.leaseOwner, undefined);
  assert.equal(system.publisher.records.length, 28);

  const snapshot = system.metrics.snapshot();
  assert.equal(snapshot.counters['worker.workflows.claimed'], 2);
  assert.equal(snapshot.counters['worker.workflows.completed'], 2);
  assert.equal(snapshot.counters['worker.outbox.published'], 28);
});

test('returns failed publications to the pending queue with bounded retry metadata', async () => {
  const system = setup();
  await system.workflow.start({ source: syntheticPropertySource, buyers: syntheticBuyers });
  let attempts = 0;
  const failingPublisher: OutboxPublisher = {
    async publish(): Promise<void> {
      attempts += 1;
      throw new Error('temporary broker failure');
    },
  };
  const worker = new WorkerRunner({
    runtime: system.runtime,
    store: system.store,
    workflow: system.workflow,
    metrics: system.metrics,
    publisher: failingPublisher,
    workerId: 'worker-b',
    retryDelayMs: 5_000,
  });

  const result = await worker.drainOutbox();
  assert.equal(result.failed, 1);
  assert.equal(attempts, 1);
  const record = (await system.store.listOutbox())[0]!;
  assert.equal(record.status, 'pending');
  assert.equal(record.attemptCount, 1);
  assert.equal(record.availableAt, '2026-08-11T19:00:05.000Z');
  assert.equal(record.leaseOwner, undefined);
});
