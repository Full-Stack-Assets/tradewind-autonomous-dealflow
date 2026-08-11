import type { Clock } from '../../domain/src/clock.ts';
import type { PropertyType, SourceRecord } from '../../domain/src/types.ts';
import type { ArcGisFeature } from './arcgis.ts';
import { ArcGisFeatureServiceClient, ArcGisItemResolver } from './arcgis.ts';
import type { HttpTransport } from './http.ts';

export const MASSGIS_PARCELS_ITEM_ID = '73d4c766167848b795f1048cad3919c7';
export const MASSGIS_ITEM_URL = `https://www.arcgis.com/home/item.html?id=${MASSGIS_PARCELS_ITEM_ID}`;

export const MASSGIS_OUT_FIELDS = [
  'OBJECTID', 'LOC_ID', 'SITE_ADDR', 'CITY', 'ZIP', 'TOTAL_VAL', 'OWNER1',
  'OWN_STATE', 'USE_CODE', 'ZONING', 'YEAR_BUILT', 'LS_PRICE', 'LS_DATE',
];

function text(attributes: Record<string, unknown>, field: string, fallback = ''): string {
  const value = attributes[field];
  return value === null || value === undefined ? fallback : String(value).trim();
}

function number(attributes: Record<string, unknown>, field: string): number | undefined {
  const value = Number(attributes[field]);
  return Number.isFinite(value) ? value : undefined;
}

function propertyType(useCode: string): PropertyType {
  const code = useCode.replace(/\D/g, '');
  if (/^(101|102|109)/.test(code)) return 'single_family';
  if (/^(103|104|105|111|112)/.test(code)) return 'multi_family';
  if (/^(13|102C)/.test(useCode.toUpperCase())) return 'condo';
  if (/^(4|9)/.test(code)) return 'land';
  return 'other';
}

function dollarsToCents(value: number | undefined): number {
  return value === undefined ? 0 : Math.round(value * 100);
}

function dateOnly(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const asNumber = typeof value === 'number' ? value : Number(value);
  const date = Number.isFinite(asNumber) ? new Date(asNumber) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

export function mapMassGisFeature(
  feature: ArcGisFeature,
  options: { retrievedAt: string; serviceUrl: string },
): SourceRecord {
  const attributes = feature.attributes;
  const objectId = text(attributes, 'OBJECTID');
  const parcelId = text(attributes, 'LOC_ID', objectId);
  const useCode = text(attributes, 'USE_CODE');
  const zoning = text(attributes, 'ZONING');
  const yearBuilt = number(attributes, 'YEAR_BUILT');
  const lastSalePrice = number(attributes, 'LS_PRICE');
  const lastSaleDate = dateOnly(attributes.LS_DATE);
  return {
    sourceId: `massgis-parcels:${parcelId}`,
    sourceType: 'massgis_level_3_parcels',
    retrievedAt: options.retrievedAt,
    synthetic: false,
    sourceUrl: options.serviceUrl,
    sourceItemId: MASSGIS_PARCELS_ITEM_ID,
    sourceRecordId: objectId,
    parcelId,
    address1: text(attributes, 'SITE_ADDR'),
    city: text(attributes, 'CITY'),
    state: 'MA',
    postalCode: text(attributes, 'ZIP').slice(0, 5),
    propertyType: propertyType(useCode),
    assessedValueCents: dollarsToCents(number(attributes, 'TOTAL_VAL')),
    ownerName: text(attributes, 'OWNER1', 'UNKNOWN'),
    ownerMailingState: text(attributes, 'OWN_STATE', 'MA'),
    ...(useCode ? { useCode } : {}),
    ...(zoning ? { zoning } : {}),
    ...(yearBuilt === undefined ? {} : { yearBuilt: Math.trunc(yearBuilt) }),
    ...(lastSalePrice === undefined ? {} : { lastSalePriceCents: dollarsToCents(lastSalePrice) }),
    ...(lastSaleDate === undefined ? {} : { lastSaleDate }),
    rawPayload: JSON.parse(JSON.stringify(attributes)) as Record<string, unknown>,
  };
}

export class MassGisParcelProvider {
  readonly sourceId = 'massgis-level-3-parcels';
  private readonly transport: HttpTransport;
  private readonly clock: Clock;
  private readonly layerId: number;
  private readonly pageSize: number;

  constructor(transport: HttpTransport, clock: Clock, layerId = 0, pageSize = 1000) {
    this.transport = transport;
    this.clock = clock;
    this.layerId = layerId;
    this.pageSize = pageSize;
  }

  async fetchPage(cursor?: string): Promise<{ records: SourceRecord[]; cursor?: string }> {
    const resolver = new ArcGisItemResolver(this.transport);
    const serviceUrl = await resolver.resolveFeatureServiceUrl(MASSGIS_PARCELS_ITEM_ID);
    const client = new ArcGisFeatureServiceClient(this.transport, serviceUrl, this.layerId, this.pageSize);
    const where = cursor ? `OBJECTID > ${Number(cursor) || 0}` : '1=1';
    const features = await client.queryAll({ where, outFields: MASSGIS_OUT_FIELDS });
    const retrievedAt = this.clock.now();
    const records = features.map((feature) => mapMassGisFeature(feature, {
      retrievedAt,
      serviceUrl: `${serviceUrl.replace(/\/$/, '')}/${this.layerId}`,
    }));
    const objectIds = records.map((record) => Number(record.sourceRecordId)).filter(Number.isFinite);
    const nextCursor = objectIds.length > 0 ? String(Math.max(...objectIds)) : cursor;
    return { records, ...(nextCursor === undefined ? {} : { cursor: nextCursor }) };
  }
}
