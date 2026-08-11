import type { Clock, IdSource } from './clock.ts';
import type { Property, SourceLineage, SourceRecord } from './types.ts';

function optionalTrim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeProperty(source: SourceRecord, runtime: Clock & IdSource): Property {
  const now = runtime.now();
  const useCode = optionalTrim(source.useCode);
  const zoning = optionalTrim(source.zoning);
  const lineage: SourceLineage = {
    sourceId: source.sourceId,
    sourceType: source.sourceType,
    retrievedAt: source.retrievedAt,
    synthetic: source.synthetic,
    ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
    ...(source.sourceItemId ? { sourceItemId: source.sourceItemId } : {}),
    ...(source.sourceRecordId ? { sourceRecordId: source.sourceRecordId } : {}),
  };
  return {
    id: runtime.nextId('property'),
    schemaVersion: '1',
    createdAt: now,
    updatedAt: now,
    parcelSnapshotId: runtime.nextId('parcel-snapshot'),
    parcelId: source.parcelId,
    address1: source.address1.trim(),
    city: source.city.trim(),
    state: source.state,
    postalCode: source.postalCode.trim(),
    propertyType: source.propertyType,
    assessedValueCents: source.assessedValueCents,
    ...(source.estimatedMortgageBalanceCents === undefined ? {} : { estimatedMortgageBalanceCents: source.estimatedMortgageBalanceCents }),
    ownerName: source.ownerName.trim(),
    ownerMailingState: source.ownerMailingState.trim(),
    ...(source.vacancyIndicator === undefined ? {} : { vacancyIndicator: source.vacancyIndicator }),
    ...(source.distressIndicator === undefined ? {} : { distressIndicator: source.distressIndicator }),
    ...(useCode === undefined ? {} : { useCode }),
    ...(zoning === undefined ? {} : { zoning }),
    ...(source.yearBuilt === undefined ? {} : { yearBuilt: source.yearBuilt }),
    ...(source.lastSalePriceCents === undefined ? {} : { lastSalePriceCents: source.lastSalePriceCents }),
    ...(source.lastSaleDate === undefined ? {} : { lastSaleDate: source.lastSaleDate }),
    ...(source.rawPayload === undefined ? {} : { rawPayload: JSON.parse(JSON.stringify(source.rawPayload)) as Record<string, unknown> }),
    lineage,
  };
}
