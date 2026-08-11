import { ArcGisItemResolver } from './arcgis.ts';
import type { HttpTransport } from './http.ts';
import { MASSGIS_PARCELS_ITEM_ID } from './massgis.ts';
import {
  parseRiMunicipalDirectory,
  RI_LAND_TAX_DIRECTORY_URL,
  type RiSourceVendor,
} from './ri-directory.ts';

export interface MassGisSourceProbe {
  jurisdiction: 'MA';
  sourceId: 'massgis-level-3-parcels';
  sourceUrl: string;
  layerName: string;
  objectIdField: string;
  recordCount: number;
  maxRecordCount: number;
  supportsPagination: boolean;
  currentVersion: number;
  liveVerified: true;
}

export interface RiDirectorySourceProbe {
  jurisdiction: 'RI';
  sourceId: 'ri-municipal-land-tax-directory';
  sourceUrl: string;
  municipalityCount: number;
  vendors: RiSourceVendor[];
  liveVerified: true;
}

export type LiveSourceProbe = MassGisSourceProbe | RiDirectorySourceProbe;

function object(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Source metadata is missing ${field}`);
  }
  return value.trim();
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Source metadata is missing ${field}`);
  }
  return value;
}

function requireSuccess(status: number, source: string): void {
  if (status < 200 || status >= 300) throw new Error(`${source} preflight failed with HTTP ${status}`);
}

export async function probeMassGisSource(
  transport: HttpTransport,
  timeoutMs = 30_000,
): Promise<MassGisSourceProbe> {
  const resolver = new ArcGisItemResolver(transport);
  const serviceUrl = await resolver.resolveFeatureServiceUrl(MASSGIS_PARCELS_ITEM_ID);
  const sourceUrl = `${serviceUrl}/0`;
  const metadataResponse = await transport.request({
    url: `${sourceUrl}?${new URLSearchParams({ f: 'json' }).toString()}`,
    timeoutMs,
    maxAttempts: 3,
  });
  requireSuccess(metadataResponse.status, 'MassGIS metadata');
  const metadata = object(metadataResponse.body, 'MassGIS metadata response was invalid');
  const countResponse = await transport.request({
    url: `${sourceUrl}/query?${new URLSearchParams({
      f: 'json',
      where: '1=1',
      returnCountOnly: 'true',
    }).toString()}`,
    timeoutMs,
    maxAttempts: 3,
  });
  requireSuccess(countResponse.status, 'MassGIS count');
  const count = object(countResponse.body, 'MassGIS count response was invalid');
  const advanced = metadata.advancedQueryCapabilities === undefined
    ? {}
    : object(metadata.advancedQueryCapabilities, 'MassGIS query capabilities were invalid');
  const recordCount = requiredNumber(count.count, 'record count');
  if (!Number.isSafeInteger(recordCount) || recordCount < 0) {
    throw new Error('Source metadata record count must be a non-negative integer');
  }
  return {
    jurisdiction: 'MA',
    sourceId: 'massgis-level-3-parcels',
    sourceUrl,
    layerName: requiredString(metadata.name, 'layer name'),
    objectIdField: requiredString(
      metadata.objectIdField ?? metadata.objectIdFieldName,
      'object ID field',
    ),
    recordCount,
    maxRecordCount: requiredNumber(metadata.maxRecordCount, 'maximum record count'),
    supportsPagination: advanced.supportsPagination === true,
    currentVersion: requiredNumber(metadata.currentVersion, 'current version'),
    liveVerified: true,
  };
}

export async function probeRiDirectorySource(
  transport: HttpTransport,
  timeoutMs = 30_000,
): Promise<RiDirectorySourceProbe> {
  const response = await transport.request({
    url: RI_LAND_TAX_DIRECTORY_URL,
    timeoutMs,
    maxAttempts: 3,
  });
  requireSuccess(response.status, 'RI directory');
  if (typeof response.body !== 'string') throw new Error('RI directory response was not HTML');
  const sources = parseRiMunicipalDirectory(response.body, RI_LAND_TAX_DIRECTORY_URL);
  if (sources.length === 0) throw new Error('RI directory contained no municipality sources');
  const vendors = [...new Set(sources.flatMap((source) => [
    source.landRecordsVendor,
    source.taxAssessmentVendor,
  ]).filter((vendor): vendor is RiSourceVendor => vendor !== undefined))].sort();
  return {
    jurisdiction: 'RI',
    sourceId: 'ri-municipal-land-tax-directory',
    sourceUrl: RI_LAND_TAX_DIRECTORY_URL,
    municipalityCount: sources.length,
    vendors,
    liveVerified: true,
  };
}
