import assert from 'node:assert/strict';
import test from 'node:test';
import { operatorHtml } from '../apps/api/src/operator-html.ts';

test('Tradewind review interface preserves provenance and authority boundaries', () => {
  const html = operatorHtml();
  assert.match(html, /Post-merge review snapshot/);
  assert.match(html, /Interface review only/);
  assert.match(html, /Synthetic simulation only/);
  assert.match(html, /\/v1\/workflows/);
  assert.match(html, /\/v1\/sources/);
  assert.doesNotMatch(html, />1,248</);
  assert.doesNotMatch(html, />862</);
  assert.doesNotMatch(html, />386</);
});
