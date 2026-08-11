import assert from 'node:assert/strict';
import test from 'node:test';
import { SystemRuntime } from '../packages/runtime/src/system-runtime.ts';

test('system runtime emits UTC timestamps and collision-resistant prefixed ids', () => {
  const runtime = new SystemRuntime();
  const first = runtime.nextId('workflow');
  const second = runtime.nextId('workflow');
  assert.ok(/^workflow-[0-9a-f-]{36}$/.test(first));
  assert.ok(/^workflow-[0-9a-f-]{36}$/.test(second));
  assert.notEqual(first, second);
  assert.ok(!Number.isNaN(Date.parse(runtime.now())));
  assert.ok(runtime.now().endsWith('Z'));
});
