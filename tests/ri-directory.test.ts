import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseRiMunicipalDirectory, RI_LAND_TAX_DIRECTORY_URL } from '../packages/ingestion/src/ri-directory.ts';

test('parses the official RI municipality directory into a provider-neutral registry', async () => {
  const html = await readFile('fixtures/ri-land-records-directory.html', 'utf8');
  const sources = parseRiMunicipalDirectory(html, RI_LAND_TAX_DIRECTORY_URL);

  assert.equal(RI_LAND_TAX_DIRECTORY_URL, 'https://www.ri.gov/towns/landtaxdata/');
  assert.deepEqual(sources.map((source) => source.municipality), [
    'Barrington',
    'Central Falls',
    'Coventry',
    'Cranston',
    'Providence',
  ]);
  assert.equal(sources[0]?.landRecordsVendor, 'uslandrecords');
  assert.equal(sources[0]?.taxAssessmentVendor, 'vgsi');
  assert.equal(sources[1]?.taxAssessmentVendor, 'nereval');
  assert.equal(sources[3]?.landRecordsVendor, 'crc');
  assert.equal(sources[4]?.taxAssessmentVendor, 'other');
  assert.ok(sources.every((source) => source.landRecordsUrl !== source.taxAssessmentUrl));
});

test('parses the current RI.gov list layout and preserves municipalities with tax-only sources', () => {
  const html = [
    '<ul class="list">',
    '<li>BARRINGTON: <a href="https://i2f.uslandrecords.com/RI/Barrington/">Land Records</a> | <a href="http://nereval.com/SearchInfo.aspx?town=Barrington">Tax Assessments</a></li>',
    '<li>COVENTRY: <a href="http://nereval.com/SearchInfo.aspx?town=Coventry">Tax Assessments</a></li>',
    '<li>PROVIDENCE: <a href="https://data.nereval.com/Search.aspx?town=Providence">Land Records</a> | <a href="http://gis.vgsi.com/providenceri">Tax Assessments</a></li>',
    '</ul>',
  ].join('\n');

  const sources = parseRiMunicipalDirectory(html, RI_LAND_TAX_DIRECTORY_URL);

  assert.deepEqual(sources.map((source) => source.municipality), ['Barrington', 'Coventry', 'Providence']);
  assert.equal(sources[0]?.landRecordsVendor, 'uslandrecords');
  assert.equal(sources[0]?.taxAssessmentVendor, 'nereval');
  assert.equal(sources[1]?.landRecordsVendor, undefined);
  assert.equal(sources[1]?.taxAssessmentVendor, 'nereval');
  assert.equal(sources[2]?.landRecordsVendor, 'nereval');
  assert.equal(sources[2]?.taxAssessmentVendor, 'vgsi');
});

test('parses the current RI.gov list markup and preserves municipalities with tax-only sources', () => {
  const html = `
    <ul class="list">
      <li><strong>CITY/TOWN</strong></li>
      <li>BARRINGTON: <a href="https://i2f.uslandrecords.com/RI/Barrington/">Land Records</a> | <a href="http://nereval.com/SearchInfo.aspx?town=Barrington">Tax Assessments</a></li>
      <li>COVENTRY: <a href="http://nereval.com/SearchInfo.aspx?town=Coventry">Tax Assessments</a></li>
    </ul>
  `;

  const sources = parseRiMunicipalDirectory(html, RI_LAND_TAX_DIRECTORY_URL);

  assert.deepEqual(sources, [
    {
      municipality: 'Barrington',
      landRecordsUrl: 'https://i2f.uslandrecords.com/RI/Barrington/',
      taxAssessmentUrl: 'http://nereval.com/SearchInfo.aspx?town=Barrington',
      landRecordsVendor: 'uslandrecords',
      taxAssessmentVendor: 'nereval',
      directoryUrl: RI_LAND_TAX_DIRECTORY_URL,
    },
    {
      municipality: 'Coventry',
      taxAssessmentUrl: 'http://nereval.com/SearchInfo.aspx?town=Coventry',
      taxAssessmentVendor: 'nereval',
      directoryUrl: RI_LAND_TAX_DIRECTORY_URL,
    },
  ]);
});
