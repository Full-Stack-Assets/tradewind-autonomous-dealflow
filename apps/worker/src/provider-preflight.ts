import {
  inspectProviderReadiness,
  type ProviderEnvironment,
  type ProviderReadinessReport,
} from '../../../packages/providers/src/readiness.ts';

export function runProviderPreflight(
  environment: ProviderEnvironment = process.env,
  write: (chunk: string) => void = (chunk) => process.stdout.write(chunk),
): ProviderReadinessReport {
  const report = inspectProviderReadiness(environment);
  write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1]?.endsWith('/provider-preflight.ts')) {
  runProviderPreflight();
}
