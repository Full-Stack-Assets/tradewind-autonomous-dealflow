import assert from 'node:assert/strict';
import test from 'node:test';
import type { SqlClient, SqlConnection, SqlResult } from '../packages/persistence/src/contracts.ts';
import { probePostgresReadiness } from '../packages/runtime/src/application.ts';

class ReadinessConnection implements SqlConnection {
  readonly queries: string[] = [];
  released = false;
  private readonly row: Record<string, unknown> | undefined;
  private readonly failure: Error | undefined;

  constructor(row: Record<string, unknown> | undefined, failure?: Error) {
    this.row = row;
    this.failure = failure;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
  ): Promise<SqlResult<Row>> {
    this.queries.push(text);
    if (this.failure) throw this.failure;
    return { rows: this.row ? [this.row as Row] : [], rowCount: this.row ? 1 : 0 };
  }

  release(): void {
    this.released = true;
  }
}

class ReadinessClient implements SqlClient {
  readonly connection: ReadinessConnection;

  constructor(connection: ReadinessConnection) {
    this.connection = connection;
  }
  async connect(): Promise<SqlConnection> {
    return this.connection;
  }
}

test('PostgreSQL readiness verifies PostGIS and migrated core tables rather than connection alone', async () => {
  const connection = new ReadinessConnection({
    postgis_version: '3.4.2',
    workflow_checkpoints: 'workflow_checkpoints',
    outbox: 'outbox',
  });
  const result = await probePostgresReadiness(new ReadinessClient(connection));

  assert.equal(result.ready, true);
  assert.equal(result.checks.persistence, 'postgres:connected');
  assert.equal(result.checks.postgis, '3.4.2');
  assert.equal(result.checks.migrations, 'core:present');
  assert.equal(connection.released, true);
  assert.equal(connection.queries.length, 1);
  assert.ok(connection.queries[0]!.includes('PostGIS_Version()'));
  assert.ok(connection.queries[0]!.includes("to_regclass('public.workflow_checkpoints')"));
  assert.ok(connection.queries[0]!.includes("to_regclass('public.outbox')"));
});

test('PostgreSQL readiness fails closed when PostGIS or migrations are unavailable', async () => {
  const incomplete = new ReadinessConnection({
    postgis_version: null,
    workflow_checkpoints: null,
    outbox: null,
  });
  const incompleteResult = await probePostgresReadiness(new ReadinessClient(incomplete));
  assert.equal(incompleteResult.ready, false);
  assert.equal(incompleteResult.checks.persistence, 'postgres:incomplete');
  assert.equal(incomplete.released, true);

  const failed = new ReadinessConnection(undefined, new Error('connection refused'));
  const failedResult = await probePostgresReadiness(new ReadinessClient(failed));
  assert.equal(failedResult.ready, false);
  assert.equal(failedResult.checks.persistence, 'postgres:unavailable');
  assert.equal(failed.released, true);
});
