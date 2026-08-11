import type { HttpTransport } from './http.ts';

export const RI_LAND_TAX_DIRECTORY_URL = 'https://www.ri.gov/towns/landtaxdata/';
export type RiSourceVendor = 'vgsi' | 'nereval' | 'crc' | 'uslandrecords' | 'other';

export interface RiMunicipalSource {
  municipality: string;
  landRecordsUrl?: string;
  taxAssessmentUrl?: string;
  landRecordsVendor?: RiSourceVendor;
  taxAssessmentVendor?: RiSourceVendor;
  directoryUrl: string;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function absoluteUrl(href: string, baseUrl: string): string {
  return new URL(decodeHtml(href), baseUrl).toString();
}

function classify(url: string): RiSourceVendor {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('vgsi')) return 'vgsi';
  if (host.includes('nereval')) return 'nereval';
  if (host.includes('crcpropertyinfo') || host.includes('crcdb')) return 'crc';
  if (host.includes('uslandrecords')) return 'uslandrecords';
  return 'other';
}

function titleCase(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/(^|[\s-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`);
}

function parseSource(
  municipalityMarkup: string,
  linkMarkup: string,
  directoryUrl: string,
): RiMunicipalSource | undefined {
  const municipality = titleCase(decodeHtml(municipalityMarkup).replace(/:\s*$/, ''));
  if (!municipality || municipality === 'City/Town') return undefined;
  let landRecordsUrl: string | undefined;
  let taxAssessmentUrl: string | undefined;
  for (const match of linkMarkup.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = decodeHtml(match[2]!).toLocaleLowerCase('en-US');
    const url = absoluteUrl(match[1]!, directoryUrl);
    if (label.includes('land record') || label.includes('land evidence')) landRecordsUrl = url;
    if (label.includes('tax assessment') || label.includes('tax assessor')) taxAssessmentUrl = url;
  }
  if (!landRecordsUrl && !taxAssessmentUrl) return undefined;
  return {
    municipality,
    ...(landRecordsUrl === undefined
      ? {}
      : { landRecordsUrl, landRecordsVendor: classify(landRecordsUrl) }),
    ...(taxAssessmentUrl === undefined
      ? {}
      : { taxAssessmentUrl, taxAssessmentVendor: classify(taxAssessmentUrl) }),
    directoryUrl,
  };
}

export function parseRiMunicipalDirectory(html: string, directoryUrl = RI_LAND_TAX_DIRECTORY_URL): RiMunicipalSource[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const sources = new Map<string, RiMunicipalSource>();
  for (const row of rows) {
    const cells = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]!);
    if (cells.length < 2) continue;
    const source = parseSource(cells[0]!, row[1]!, directoryUrl);
    if (source) sources.set(source.municipality, source);
  }
  for (const item of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
    const visibleText = decodeHtml(item[1]!);
    const colon = visibleText.indexOf(':');
    if (colon < 1) continue;
    const source = parseSource(visibleText.slice(0, colon), item[1]!, directoryUrl);
    if (source) sources.set(source.municipality, source);
  }
  return [...sources.values()].sort((a, b) => a.municipality.localeCompare(b.municipality));
}

export class RiMunicipalSourceDirectory {
  private readonly transport: HttpTransport;
  private readonly directoryUrl: string;

  constructor(transport: HttpTransport, directoryUrl = RI_LAND_TAX_DIRECTORY_URL) {
    this.transport = transport;
    this.directoryUrl = directoryUrl;
  }

  async load(): Promise<RiMunicipalSource[]> {
    const response = await this.transport.request({ url: this.directoryUrl });
    if (typeof response.body !== 'string') throw new Error('RI directory response was not HTML');
    return parseRiMunicipalDirectory(response.body, this.directoryUrl);
  }
}
