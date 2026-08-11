import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import { normalizeProperty } from '../packages/domain/src/normalize.ts';
import { scoreLead } from '../packages/domain/src/scoring.ts';
import { MASSGIS_PARCELS_ITEM_ID, mapMassGisFeature } from '../packages/ingestion/src/massgis.ts';

test('maps official MassGIS fields while preserving unknown facts and raw attributes', async () => {
  const fixture = JSON.parse(await readFile('fixtures/massgis-feature-response.json', 'utf8')) as {
    features: Array<{ attributes: Record<string, unknown> }>;
  };
  const feature = fixture.features[0]!;
  const record = mapMassGisFeature(feature, {
    retrievedAt: '2026-08-11T16:00:00.000Z',
    serviceUrl: 'https://services.arcgis.com/example/FeatureServer/0',
  });

  assert.equal(MASSGIS_PARCELS_ITEM_ID, '73d4c766167848b795f1048cad3919c7');
  assert.equal(record.sourceRecordId, '101');
  assert.equal(record.parcelId, 'NB-000101');
  assert.equal(record.address1, '42 Acushnet Avenue');
  assert.equal(record.assessedValueCents, 31_500_000);
  assert.equal(record.ownerName, 'EXAMPLE OWNER');
  assert.equal(record.propertyType, 'single_family');
  assert.equal(record.zoning, 'RA');
  assert.equal(record.yearBuilt, 1925);
  assert.equal(record.lastSalePriceCents, 18_500_000);
  assert.equal(record.lastSaleDate, '2024-01-01');
  assert.equal(record.estimatedMortgageBalanceCents, undefined);
  assert.equal(record.vacancyIndicator, undefined);
  assert.equal(record.distressIndicator, undefined);
  assert.deepEqual(record.rawPayload, feature.attributes);

  const property = normalizeProperty(record, new DeterministicRuntime('2026-08-11T16:00:00.000Z'));
  const score = scoreLead(property);
  assert.equal(score.components.equityProxy, 0);
  assert.equal(score.components.vacancyDistress, 0);
});
