import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const requiredFragments = [
  'CREATE EXTENSION IF NOT EXISTS postgis',
  'CREATE TABLE workflow_runs',
  'CREATE TABLE workflow_checkpoints',
  'CREATE TABLE domain_events',
  'CREATE TABLE provider_calls',
  'CREATE TABLE outbox',
  'CREATE TABLE source_snapshots',
  'CREATE TABLE properties',
  'CREATE TABLE buyers',
  'CREATE TABLE completed_transactions',
  'geometry(Geometry, 4326)',
  'payload JSONB',
  'dedupe_key TEXT NOT NULL UNIQUE',
  'FOR UPDATE SKIP LOCKED',
];

test('defines the required PostgreSQL/PostGIS persistence schema', async () => {
  const sql = await readFile(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8');
  for (const fragment of requiredFragments) {
    assert.ok(sql.includes(fragment), `migration missing: ${fragment}`);
  }
  assert.ok(/event_id TEXT PRIMARY KEY/.test(sql));
  assert.ok(/CREATE INDEX .*workflow_checkpoints.*status/i.test(sql));
  assert.ok(/CREATE INDEX .*outbox.*status/i.test(sql));
});
