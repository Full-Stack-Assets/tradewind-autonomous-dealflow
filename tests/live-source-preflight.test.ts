import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpRequest, HttpResponse, HttpTransport } from '../packages/ingestion/src/http.ts';
import { runLiveSourcePreflight } from '../apps/worker/src/live-source-preflight.ts';

class RoutingTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const url = new URL(request.url);
    if (url.pathname.includes('/sharing/rest/content/items/')) {
      return {
        status: 200,
        headers: {},
        body: { url: 'https://services.example.test/MassGIS/FeatureServer' },
      };
    }
    if (url.hostname === 'services.example.test' && url.pathname.endsWith('/0')) {
      return {
        status: 200,
        headers: {},
        body: {
          currentVersion: 11.3,
          name: 'Massachusetts Property Tax Parcels',
          objectIdField: 'OBJECTID',
          maxRecordCount: 2000,
          advancedQueryCapabilities: { supportsPagination: true },
        },
      };
    }
    if (url.hostname === 'services.example.test' && url.pathname.endsWith('/0/query')) {
      return { status: 200, headers: {}, body: { count: 2_500_000 } };
    }
    if (url.hostname === 'www.ri.gov') {
      return {
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: [
          '<table>',
          '<tr><td>Barrington</td><td><a href="https://records.example.test/a">Land Records</a></td><td><a href="https://barrington.vgsi.com">Tax Assessments</a></td></tr>',
          '<tr><td>Providence</td><td><a href="https://records.example.test/b">Land Records</a></td><td><a href="https://tax.example.test/p">Tax Assessments</a></td></tr>',
          '</table>',
        ].join('\n'),
      };
    }
    throw new Error(`Unexpected request: ${request.url}`);
  }
}

test('requires explicit network opt-in before source probing', async () => {
  const transport = new RoutingTransport();
  await assert.rejects(
    () => runLiveSourcePreflight({ allowNetwork: false, transport }),
    /--allow-network/,
  );
  assert.equal(transport.requests.length, 0);
});

test('probes official MA and RI source health without retrieving parcel attributes', async () => {
  const transport = new RoutingTransport();
  const summary = await runLiveSourcePreflight({
    allowNetwork: true,
    transport,
    timeoutMs: 1000,
  });

  assert.deepEqual(summary, [
    {
      jurisdiction: 'MA',
      sourceId: 'massgis-level-3-parcels',
      sourceUrl: 'https://services.example.test/MassGIS/FeatureServer/0',
      layerName: 'Massachusetts Property Tax Parcels',
      objectIdField: 'OBJECTID',
      recordCount: 2_500_000,
      maxRecordCount: 2000,
      supportsPagination: true,
      currentVersion: 11.3,
      liveVerified: true,
    },
    {
      jurisdiction: 'RI',
      sourceId: 'ri-municipal-land-tax-directory',
      sourceUrl: 'https://www.ri.gov/towns/landtaxdata/',
      municipalityCount: 2,
      vendors: ['other', 'vgsi'],
      liveVerified: true,
    },
  ]);

  const countRequest = transport.requests.find((request) => request.url.includes('/query?'));
  assert.ok(countRequest);
  const countUrl = new URL(countRequest.url);
  assert.equal(countUrl.searchParams.get('returnCountOnly'), 'true');
  assert.equal(countUrl.searchParams.get('outFields'), null);
  assert.equal(countUrl.searchParams.get('returnGeometry'), null);
  assert.equal(transport.requests.some((request) => request.url.includes('outFields=')), false);
});
