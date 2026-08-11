import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpRequest, HttpResponse, HttpTransport } from '../packages/ingestion/src/http.ts';
import { ArcGisFeatureServiceClient, ArcGisItemResolver } from '../packages/ingestion/src/arcgis.ts';

class FakeTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private responseIndex = 0;
  private readonly responses: HttpResponse[];

  constructor(responses: HttpResponse[]) {
    this.responses = responses;
  }

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses[this.responseIndex];
    this.responseIndex += 1;
    if (!response) throw new Error('Unexpected request');
    return response;
  }
}

test('resolves an ArcGIS item and paginates feature queries with stable deduplication', async () => {
  const transport = new FakeTransport([
    { status: 200, headers: {}, body: { url: 'https://services.arcgis.com/example/FeatureServer' } },
    {
      status: 200,
      headers: {},
      body: {
        exceededTransferLimit: true,
        features: [
          { attributes: { OBJECTID: 1, LOC_ID: 'A' } },
          { attributes: { OBJECTID: 2, LOC_ID: 'B' } },
        ],
      },
    },
    {
      status: 200,
      headers: {},
      body: {
        exceededTransferLimit: false,
        features: [
          { attributes: { OBJECTID: 2, LOC_ID: 'B' } },
          { attributes: { OBJECTID: 3, LOC_ID: 'C' } },
        ],
      },
    },
  ]);
  const resolver = new ArcGisItemResolver(transport);
  const serviceUrl = await resolver.resolveFeatureServiceUrl('item-123');
  const client = new ArcGisFeatureServiceClient(transport, serviceUrl, 0, 2);
  const features = await client.queryAll({ where: "CITY = 'New Bedford'", outFields: ['OBJECTID', 'LOC_ID'] });

  assert.equal(serviceUrl, 'https://services.arcgis.com/example/FeatureServer');
  assert.deepEqual(features.map((feature) => feature.attributes.OBJECTID), [1, 2, 3]);
  assert.equal(transport.requests.length, 3);
  const firstQuery = new URL(transport.requests[1]!.url);
  const secondQuery = new URL(transport.requests[2]!.url);
  assert.equal(firstQuery.pathname, '/example/FeatureServer/0/query');
  assert.equal(firstQuery.searchParams.get('where'), "CITY = 'New Bedford'");
  assert.equal(firstQuery.searchParams.get('outFields'), 'OBJECTID,LOC_ID');
  assert.equal(firstQuery.searchParams.get('returnGeometry'), 'false');
  assert.equal(firstQuery.searchParams.get('resultOffset'), '0');
  assert.equal(firstQuery.searchParams.get('resultRecordCount'), '2');
  assert.equal(secondQuery.searchParams.get('resultOffset'), '2');
});
