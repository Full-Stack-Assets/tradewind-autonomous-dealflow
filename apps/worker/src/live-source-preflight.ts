import { FetchHttpTransport, type HttpTransport } from '../../../packages/ingestion/src/http.ts';
import {
  probeMassGisSource,
  probeRiDirectorySource,
  type LiveSourceProbe,
} from '../../../packages/ingestion/src/source-preflight.ts';

export interface LiveSourcePreflightOptions {
  allowNetwork: boolean;
  transport?: HttpTransport;
  timeoutMs?: number;
}

export async function runLiveSourcePreflight(
  options: LiveSourcePreflightOptions,
): Promise<LiveSourceProbe[]> {
  if (!options.allowNetwork) {
    throw new Error('Live official-source probing requires the explicit --allow-network flag');
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Source preflight timeout must be a positive integer');
  }
  const transport = options.transport ?? new FetchHttpTransport();
  const [massachusetts, rhodeIsland] = await Promise.all([
    probeMassGisSource(transport, timeoutMs),
    probeRiDirectorySource(transport, timeoutMs),
  ]);
  return [massachusetts, rhodeIsland];
}

if (process.argv[1]?.endsWith('/live-source-preflight.ts')) {
  runLiveSourcePreflight({ allowNetwork: process.argv.includes('--allow-network') })
    .then((summary) => process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
