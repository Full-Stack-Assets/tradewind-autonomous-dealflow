import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryEventStore } from '../packages/events/src/event-store.ts';

test('preserves append order and does not expose mutable internal storage', () => {
  const store = new InMemoryEventStore();
  store.append({ eventId: 'e1', workflowId: 'w1', eventType: 'PropertyIngested', aggregateType: 'Property', aggregateId: 'p1', occurredAt: '2026-08-11T16:00:00.000Z', schemaVersion: '1', payload: {} });
  store.append({ eventId: 'e2', workflowId: 'w1', eventType: 'LeadQualified', aggregateType: 'Lead', aggregateId: 'p1', occurredAt: '2026-08-11T16:00:00.000Z', schemaVersion: '1', payload: {} });
  const firstRead = store.all();
  assert.deepEqual(firstRead.map((event) => event.eventId), ['e1', 'e2']);
  firstRead.pop();
  assert.deepEqual(store.all().map((event) => event.eventId), ['e1', 'e2']);
});
