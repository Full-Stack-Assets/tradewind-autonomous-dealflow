import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { SqlClient, SqlConnection, SqlResult } from '../packages/persistence/src/contracts.ts';
import { PostgresDealFlowStore } from '../packages/persistence/src/postgres-store.ts';

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

class RecordingConnection implements SqlConnection {
  readonly queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  released = false;

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlResult<Row>> {
    this.queries.push(values === undefined ? { text } : { text, values });
    return { rows: [], rowCount: 1 };
  }

  release(): void {
    this.released = true;
  }
}

class RecordingClient implements SqlClient {
  readonly connection = new RecordingConnection();
  async connect(): Promise<SqlConnection> {
    return this.connection;
  }
}

test('PostgreSQL runnable claims advance workflow-run and checkpoint versions together', async () => {
  const migration = await readFile(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8');
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION claim_runnable_workflows');
  const end = migration.indexOf('CREATE OR REPLACE FUNCTION claim_outbox');
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const claimFunction = normalized(migration.slice(start, end));

  assert.ok(/UPDATE workflow_runs AS run/i.test(claimFunction));
  assert.ok(/UPDATE workflow_checkpoints AS checkpoint/i.test(claimFunction));
  assert.ok(/run\.version = checkpoint\.version/i.test(claimFunction));
});

test('releasing a PostgreSQL workflow lease keeps workflow-run and checkpoint versions synchronized', async () => {
  const client = new RecordingClient();
  const store = new PostgresDealFlowStore(client);

  await store.releaseWorkflowLease('workflow-lease', 'worker-a');

  assert.equal(client.connection.released, true);
  assert.equal(client.connection.queries.length, 1);
  const statement = normalized(client.connection.queries[0]!.text);
  assert.ok(/UPDATE workflow_runs AS run/i.test(statement));
  assert.ok(/UPDATE workflow_checkpoints AS checkpoint/i.test(statement));
  assert.ok(/run\.version = checkpoint\.version/i.test(statement));
  assert.deepEqual(client.connection.queries[0]!.values, ['workflow-lease', 'worker-a']);
});
