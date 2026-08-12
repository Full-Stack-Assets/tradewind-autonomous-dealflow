import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewOperatorHtml } from '../apps/api/src/review-operator-html.ts';

test('Tradewind review interface preserves provenance and authority boundaries', () => {
  const html = reviewOperatorHtml();
  assert.match(html, /Post-merge review snapshot/);
  assert.match(html, /Interface review only/);
  assert.match(html, /Synthetic simulation only/);
  assert.match(html, /\/v1\/workflows/);
  assert.match(html, /\/v1\/sources/);
  assert.equal(/>1,248</.test(html), false);
  assert.equal(/>862</.test(html), false);
  assert.equal(/>386</.test(html), false);
});
