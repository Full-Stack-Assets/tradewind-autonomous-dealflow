import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Required release commands: npm test; npm run typecheck; npm run eval; npm run smoke; git diff --check.
interface GateResult {
  name: string;
  passed: boolean;
  command: string;
  exitCode: number;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
}

interface VerificationReport {
  generatedAt: string;
  commit: string;
  passed: boolean;
  gateCount: number;
  passedCount: number;
  failedCount: number;
  gates: GateResult[];
  externalVerification: Record<string, string>;
}

function tail(value: string, limit = 4_000): string {
  return value.length <= limit ? value : value.slice(value.length - limit);
}

function run(name: string, command: string, args: string[]): GateResult {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  const exitCode = result.status ?? 1;
  return {
    name,
    passed: exitCode === 0,
    command: [command, ...args].join(' '),
    exitCode,
    durationMs: Date.now() - startedAt,
    stdoutTail: tail(result.stdout ?? ''),
    stderrTail: tail(result.stderr ?? ''),
  };
}

function inspection(name: string, passed: boolean, detail: string): GateResult {
  return {
    name,
    passed,
    command: name,
    exitCode: passed ? 0 : 1,
    durationMs: 0,
    stdoutTail: detail,
    stderrTail: '',
  };
}

function gitText(args: string[]): string {
  const result = spawnSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return (result.stdout ?? '').trim();
}

function markdown(report: VerificationReport): string {
  const rows = report.gates.map((gate) => `| ${gate.passed ? 'PASS' : 'FAIL'} | ${gate.name} | \`${gate.command}\` | ${gate.durationMs} |`).join('\n');
  return `# Tradewind Autonomous DealFlow Verification Report

- Generated: ${report.generatedAt}
- Verified commit: \`${report.commit}\`
- Overall result: **${report.passed ? 'PASS' : 'FAIL'}**
- Gates: ${report.passedCount}/${report.gateCount} passed

## Local verification gates

| Result | Gate | Command | Duration (ms) |
|---|---|---|---:|
${rows}

## Verification boundaries

- PostgreSQL/PostGIS: ${report.externalVerification.postgres}
- OpenAI: ${report.externalVerification.openai}
- ElevenLabs: ${report.externalVerification.elevenlabs}
- Enrichment/e-sign/buyer-outreach/closing: ${report.externalVerification.businessProviders}

The default local verification path is intentionally credential-free and network-free. Passing it proves deterministic behavior, packaging contracts, and adapter boundaries; it does not claim that external accounts accepted live requests.
`;
}

const gates: GateResult[] = [
  run('unit and acceptance tests', 'npm', ['test']),
  run('TypeScript typecheck', 'npm', ['run', 'typecheck']),
  run('evaluation matrix', 'npm', ['run', 'eval']),
  run('offline lifecycle smoke', 'npm', ['run', 'smoke']),
  run('migration check command', 'npm', ['run', 'migrate', '--', '--check']),
  run('git diff --check', 'git', ['diff', '--check']),
];

const domainScan = spawnSync('git', [
  'grep', '--untracked', '-n', '-E',
  "from ['\"][^'\"]*(persistence|providers|ai|voice|ingestion|apps)|from ['\"](@openai|pg)",
  '--', 'packages/domain',
], { cwd: process.cwd(), encoding: 'utf8' });
gates.push(inspection(
  'domain import boundary',
  domainScan.status === 1,
  domainScan.status === 1 ? 'No forbidden domain imports found.' : tail(`${domainScan.stdout ?? ''}${domainScan.stderr ?? ''}`),
));

const secretScan = spawnSync('git', [
  'grep', '--untracked', '-I', '-n', '-E',
  'sk-(proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----',
  '--', '.',
], { cwd: process.cwd(), encoding: 'utf8' });
gates.push(inspection(
  'forbidden secret scan',
  secretScan.status === 1,
  secretScan.status === 1 ? 'No credential-like material found.' : tail(`${secretScan.stdout ?? ''}${secretScan.stderr ?? ''}`),
));

const migration = await readFile('migrations/0001_core.sql', 'utf8');
const migrationTokens = [
  'CREATE EXTENSION IF NOT EXISTS postgis',
  'CREATE TABLE workflow_checkpoints',
  'CREATE TABLE domain_events',
  'CREATE TABLE provider_calls',
  'CREATE TABLE outbox',
  'geometry(Geometry, 4326)',
  'FOR UPDATE SKIP LOCKED',
];
const missingMigrationTokens = migrationTokens.filter((token) => !migration.includes(token));
gates.push(inspection(
  'migration schema scan',
  missingMigrationTokens.length === 0,
  missingMigrationTokens.length === 0 ? 'PostGIS, workflow, event, provider, outbox, spatial, and lease primitives found.' : `Missing: ${missingMigrationTokens.join(', ')}`,
));

const commit = gitText(['rev-parse', 'HEAD']);
const passedCount = gates.filter((gate) => gate.passed).length;
const report: VerificationReport = {
  generatedAt: new Date().toISOString(),
  commit,
  passed: passedCount === gates.length,
  gateCount: gates.length,
  passedCount,
  failedCount: gates.length - passedCount,
  gates,
  externalVerification: {
    postgres: process.env.DATABASE_URL?.trim() ? 'configured but not exercised by the credential-free release verifier' : 'unexecuted live PostgreSQL/PostGIS verification',
    openai: process.env.OPENAI_API_KEY?.trim() ? 'configured but live model invocation was not included in this verifier' : 'unexecuted live-account verification',
    elevenlabs: process.env.ELEVENLABS_API_KEY?.trim() ? 'configured but live voice session creation was not included in this verifier' : 'unexecuted live-account verification',
    businessProviders: 'unexecuted live-account verification; deterministic and HTTP contract tests executed locally',
  },
};

await mkdir('docs/release', { recursive: true });
await writeFile('docs/release/verification-report.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile('docs/release/VERIFICATION_REPORT.md', markdown(report), 'utf8');
process.stdout.write(`${JSON.stringify({ passed: report.passed, commit: report.commit, gateCount: report.gateCount, passedCount: report.passedCount, failedCount: report.failedCount })}\n`);
if (!report.passed) process.exitCode = 1;
