import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { normalizeProperty } from '../packages/domain/src/normalize.ts';
import type { HttpRequest, HttpResponse, HttpTransport } from '../packages/ingestion/src/http.ts';
import {
  CanonicalBuyerOutreachHttpProvider,
  CanonicalClosingHttpProvider,
  CanonicalEnrichmentHttpProvider,
  CanonicalSignatureHttpProvider,
} from '../packages/providers/src/http-adapters.ts';
import { ProviderFailure } from '../packages/providers/src/contracts.ts';

class FakeTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private readonly responses: HttpResponse[];
  private index = 0;

  constructor(responses: HttpResponse[]) {
    this.responses = responses;
  }

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses[this.index++];
    if (!response) throw new Error('Unexpected provider request');
    return response;
  }
}

test('injects secure canonical headers and maps all provider responses', async () => {
  const transport = new FakeTransport([
    { status: 200, headers: {}, body: { owner: { displayName: 'Owner One', entityType: 'person', contacts: [{ type: 'phone', value: '+15555550101', confidence: 0.8 }] } } },
    { status: 200, headers: {}, body: { envelopeId: 'env-1', status: 'executed' } },
    { status: 200, headers: {}, body: { buyerId: 'buyer-1' } },
    { status: 200, headers: {}, body: { closingId: 'close-1', status: 'confirmed', closedAt: '2026-08-11T16:00:00.000Z' } },
  ]);
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const property = normalizeProperty(syntheticPropertySource, runtime);
  const base = { endpoint: 'https://provider.example.test/v1', apiKey: 'super-secret', transport, timeoutMs: 4321 };

  const enrichment = await new CanonicalEnrichmentHttpProvider(base).enrich(property, runtime, 'workflow-1');
  const signature = await new CanonicalSignatureHttpProvider(base).execute('acquisition', 'deal-1', runtime, 'workflow-1');
  const buyer = await new CanonicalBuyerOutreachHttpProvider(base).selectBuyer([{ buyerId: 'buyer-1', fitScore: 90, reasons: ['eligible'] }], runtime, 'workflow-1');
  const closing = await new CanonicalClosingHttpProvider(base).confirmClosing('assignment-1', runtime, 'workflow-1');

  assert.equal(enrichment.data.owner.displayName, 'Owner One');
  assert.equal(signature.data.envelopeId, 'env-1');
  assert.equal(buyer.data.buyerId, 'buyer-1');
  assert.equal(closing.data.id, 'close-1');
  assert.ok(transport.requests.every((request) => request.headers?.Authorization === 'Bearer super-secret'));
  assert.ok(transport.requests.every((request) => request.headers?.['X-Correlation-Id'] === 'workflow-1'));
  assert.ok(transport.requests.every((request) => request.headers?.['Idempotency-Key']?.startsWith('workflow-1:')));
  assert.ok(transport.requests.every((request) => request.timeoutMs === 4321));
  assert.equal(JSON.stringify([enrichment.call, signature.call, buyer.call, closing.call]).includes('super-secret'), false);
});

test('rejects missing configuration before network access and redacts provider failures', async () => {
  const transport = new FakeTransport([{ status: 500, headers: {}, body: { error: 'super-secret internal failure' } }]);
  assert.throws(
    () => new CanonicalEnrichmentHttpProvider({ endpoint: '', apiKey: 'key', transport }),
    /endpoint is required/,
  );
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const property = normalizeProperty(syntheticPropertySource, runtime);
  const provider = new CanonicalEnrichmentHttpProvider({ endpoint: 'https://provider.test', apiKey: 'super-secret', transport });
  await assert.rejects(
    () => provider.enrich(property, runtime, 'workflow-1'),
    (error) => error instanceof ProviderFailure && !error.message.includes('super-secret') && error.retryable,
  );
});
