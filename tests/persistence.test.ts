import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkflowCheckpoint } from '../packages/domain/src/types.ts';
import type { DomainEvent } from '../packages/events/src/event-store.ts';
import type { OutboxRecord } from '../packages/persistence/src/contracts.ts';
import { InMemoryDealFlowStore } from '../packages/persistence/src/in-memory-store.ts';

const checkpoint: WorkflowCheckpoint = {
  workflowId: 'workflow-atomic',
  version: 1,
  state: 'QUALIFIED',
  status: 'runnable',
  context: { propertyId: 'property-1' },
  createdAt: '2026-08-11T16:00:00.000Z',
  updatedAt: '2026-08-11T16:00:00.000Z',
};

const event: DomainEvent = {
  eventId: 'event-atomic',
  workflowId: checkpoint.workflowId,
  eventType: 'LeadQualified',
  aggregateType: 'Lead',
  aggregateId: 'property-1',
  occurredAt: checkpoint.updatedAt,
  schemaVersion: '1',
  payload: { score: 80 },
};

const outbox: OutboxRecord = {
  id: 'outbox-atomic',
  workflowId: checkpoint.workflowId,
  eventId: event.eventId,
  topic: 'domain-events',
  dedupeKey: 'domain-events:event-atomic',
  payload: event,
  status: 'pending',
  attemptCount: 0,
  availableAt: checkpoint.updatedAt,
  createdAt: checkpoint.updatedAt,
};

test('rolls back checkpoint, event, and outbox together when a transaction fails', async () => {
  const store = new InMemoryDealFlowStore();

  await assert.rejects(
    () => store.transaction(async (tx) => {
      await tx.saveCheckpoint(checkpoint, null);
      await tx.appendEvents([event]);
      await tx.enqueueOutbox([outbox]);
      throw new Error('abort transaction');
    }),
    /abort transaction/,
  );

  assert.equal(await store.loadCheckpoint(checkpoint.workflowId), undefined);
  assert.deepEqual(await store.listEvents(checkpoint.workflowId), []);
  assert.deepEqual(await store.listOutbox(checkpoint.workflowId), []);
});

test('commits checkpoint, event, and outbox atomically on success', async () => {
  const store = new InMemoryDealFlowStore();

  await store.transaction(async (tx) => {
    await tx.saveCheckpoint(checkpoint, null);
    await tx.appendEvents([event]);
    await tx.enqueueOutbox([outbox]);
  });

  assert.deepEqual(await store.loadCheckpoint(checkpoint.workflowId), checkpoint);
  assert.deepEqual(await store.listEvents(checkpoint.workflowId), [event]);
  assert.deepEqual(await store.listOutbox(checkpoint.workflowId), [outbox]);
});

test('enforces optimistic checkpoint versions', async () => {
  const store = new InMemoryDealFlowStore();
  await store.transaction((tx) => tx.saveCheckpoint(checkpoint, null));

  await assert.rejects(
    () => store.transaction((tx) => tx.saveCheckpoint({ ...checkpoint, version: 2 }, 0)),
    /Checkpoint version conflict/,
  );

  await store.transaction((tx) => tx.saveCheckpoint({ ...checkpoint, version: 2, state: 'ENRICHED' }, 1));
  assert.equal((await store.loadCheckpoint(checkpoint.workflowId))?.version, 2);
});

test('claims runnable work with a lease and does not double-claim it', async () => {
  const store = new InMemoryDealFlowStore();
  await store.transaction((tx) => tx.saveCheckpoint(checkpoint, null));

  const first = await store.claimRunnable(10, 'worker-a', 30, '2026-08-11T16:00:00.000Z');
  const second = await store.claimRunnable(10, 'worker-b', 30, '2026-08-11T16:00:01.000Z');

  assert.equal(first.length, 1);
  assert.equal(first[0]?.leaseOwner, 'worker-a');
  assert.equal(second.length, 0);
});
