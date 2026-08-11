import assert from 'node:assert/strict';
import test from 'node:test';
import { NodePostgresSqlClient } from '../packages/persistence/src/node-postgres.ts';

test('adapts a node-postgres pool to the narrow SQL client contract', async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  let released = false;
  const pool = {
    async connect() {
      return {
        async query<Row extends Record<string, unknown> = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
          calls.push(values === undefined ? { text } : { text, values });
          return { rows: [{ value: 1 }] as unknown as Row[], rowCount: 1 };
        },
        release() { released = true; },
      };
    },
    async end() {},
  };

  const adapter = new NodePostgresSqlClient(pool);
  const connection = await adapter.connect();
  const result = await connection.query<{ value: number }>('SELECT $1::int AS value', [1]);
  assert.deepEqual(result, { rows: [{ value: 1 }], rowCount: 1 });
  assert.deepEqual(calls, [{ text: 'SELECT $1::int AS value', values: [1] }]);
  connection.release();
  assert.equal(released, true);
  await adapter.close();
});
