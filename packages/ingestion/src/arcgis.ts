import type { HttpTransport } from './http.ts';

export interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry?: Record<string, unknown>;
}

interface ArcGisItemResponse {
  url?: unknown;
  error?: { message?: unknown };
}

interface ArcGisFeatureResponse {
  features?: unknown;
  exceededTransferLimit?: unknown;
  error?: { message?: unknown };
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

export class ArcGisItemResolver {
  private readonly transport: HttpTransport;
  private readonly sharingBaseUrl: string;

  constructor(transport: HttpTransport, sharingBaseUrl = 'https://www.arcgis.com') {
    this.transport = transport;
    this.sharingBaseUrl = sharingBaseUrl.replace(/\/$/, '');
  }

  async resolveFeatureServiceUrl(itemId: string): Promise<string> {
    const url = `${this.sharingBaseUrl}/sharing/rest/content/items/${encodeURIComponent(itemId)}?f=json`;
    const response = await this.transport.request({ url });
    const body = requireObject(response.body, 'ArcGIS item response was not an object') as ArcGisItemResponse;
    if (body.error) throw new Error(String(body.error.message ?? 'ArcGIS item resolution failed'));
    if (typeof body.url !== 'string' || !/^https:\/\//.test(body.url)) {
      throw new Error(`ArcGIS item ${itemId} does not expose a FeatureServer URL`);
    }
    return body.url.replace(/\/$/, '');
  }
}

export interface ArcGisQueryOptions {
  where?: string;
  outFields: string[];
}

export class ArcGisFeatureServiceClient {
  private readonly transport: HttpTransport;
  private readonly serviceUrl: string;
  private readonly layerId: number;
  private readonly pageSize: number;

  constructor(transport: HttpTransport, serviceUrl: string, layerId = 0, pageSize = 1000) {
    this.transport = transport;
    this.serviceUrl = serviceUrl.replace(/\/$/, '').replace(/\/\d+$/, '');
    this.layerId = layerId;
    this.pageSize = pageSize;
  }

  async queryAll(options: ArcGisQueryOptions): Promise<ArcGisFeature[]> {
    const seen = new Set<string>();
    const collected: ArcGisFeature[] = [];
    let offset = 0;

    for (let page = 0; page < 100_000; page += 1) {
      const query = new URLSearchParams({
        f: 'json',
        where: options.where ?? '1=1',
        outFields: options.outFields.join(','),
        returnGeometry: 'false',
        resultOffset: String(offset),
        resultRecordCount: String(this.pageSize),
        orderByFields: 'OBJECTID ASC',
      });
      const url = `${this.serviceUrl}/${this.layerId}/query?${query.toString()}`;
      const response = await this.transport.request({ url });
      const body = requireObject(response.body, 'ArcGIS feature response was not an object') as ArcGisFeatureResponse;
      if (body.error) throw new Error(String(body.error.message ?? 'ArcGIS feature query failed'));
      if (!Array.isArray(body.features)) throw new Error('ArcGIS feature response omitted features');
      const features = body.features.map((feature) => {
        const object = requireObject(feature, 'ArcGIS feature was not an object');
        return {
          attributes: requireObject(object.attributes, 'ArcGIS feature omitted attributes'),
          ...(object.geometry && typeof object.geometry === 'object' ? { geometry: object.geometry as Record<string, unknown> } : {}),
        } satisfies ArcGisFeature;
      });
      for (const feature of features) {
        const objectId = feature.attributes.OBJECTID;
        const key = objectId === undefined ? JSON.stringify(feature.attributes) : String(objectId);
        if (!seen.has(key)) {
          seen.add(key);
          collected.push(feature);
        }
      }
      if (body.exceededTransferLimit !== true) break;
      offset += this.pageSize;
    }
    return collected;
  }
}
