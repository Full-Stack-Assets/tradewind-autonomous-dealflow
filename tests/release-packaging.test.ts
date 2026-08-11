import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';

async function text(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

test('packages a reproducible Node 22 and PostGIS runtime without embedded secrets', async () => {
  const [dockerfile, compose, dockerignore, envExample, ci, packageJson, packageLock] = await Promise.all([
    text('Dockerfile'),
    text('compose.yaml'),
    text('.dockerignore'),
    text('.env.example'),
    text('.github/workflows/ci.yml'),
    text('package.json'),
    text('package-lock.json'),
  ]);

  assert.ok(dockerfile.includes('FROM node:22'));
  assert.ok(dockerfile.includes('USER node'));
  assert.ok(dockerfile.includes('HEALTHCHECK'));
  assert.ok(dockerfile.includes('npm run api'));
  assert.ok(dockerfile.includes('COPY package.json package-lock.json'));
  assert.ok(dockerfile.includes('npm ci --omit=dev'));
  assert.equal(dockerfile.includes('npm install'), false);
  assert.ok(dockerignore.includes('.git'));
  assert.ok(dockerignore.includes('.env'));
  assert.ok(dockerignore.includes('node_modules'));
  assert.ok(dockerignore.includes('.worktrees'));

  assert.ok(compose.includes('postgis/postgis:16-3.4'));
  assert.ok(compose.includes('postgres_data'));
  assert.ok(compose.includes('npm run migrate'));
  assert.ok(compose.includes('npm run api'));
  assert.ok(compose.includes('npm run worker'));
  assert.ok(compose.includes('healthcheck'));

  const requiredEnvironmentVariables = [
    'DATABASE_URL',
    'PORT',
    'TRADEWIND_API_TOKEN',
    'TRADEWIND_PROVIDER_MODE',
    'OPENAI_API_KEY',
    'ELEVENLABS_API_KEY',
    'ELEVENLABS_AGENT_ID',
    'ELEVENLABS_PHONE_NUMBER_ID',
    'ENRICHMENT_API_URL',
    'ENRICHMENT_API_KEY',
    'SIGNATURE_API_URL',
    'SIGNATURE_API_KEY',
    'BUYER_OUTREACH_API_URL',
    'BUYER_OUTREACH_API_KEY',
    'CLOSING_API_URL',
    'CLOSING_API_KEY',
  ];
  for (const name of requiredEnvironmentVariables) {
    assert.ok(envExample.includes(`${name}=`), `missing ${name}`);
  }
  for (const line of envExample.split('\n').filter((line) => line && !line.startsWith('#'))) {
    assert.equal(line.slice(line.indexOf('=') + 1), '', `environment example must not default ${line}`);
  }
  assert.equal(/sk-[A-Za-z0-9_-]+/.test(`${dockerfile}\n${compose}\n${envExample}`), false);

  assert.ok(ci.includes('node-version: 22'));
  assert.ok(ci.includes('npm ci'));
  assert.equal(ci.includes('npm install'), false);
  assert.ok(ci.includes('npm test'));
  assert.ok(ci.includes('npm run typecheck'));
  assert.ok(ci.includes('npm run eval'));
  assert.ok(ci.includes('npm run verify:release'));

  let hasPackageLock = true;
  try {
    await access('package-lock.json');
  } catch {
    hasPackageLock = false;
  }
  assert.ok(hasPackageLock || !ci.includes('cache: npm'), 'npm caching requires a committed lockfile');

  const packageData = JSON.parse(packageJson) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lockData = JSON.parse(packageLock) as { lockfileVersion?: number; packages?: Record<string, unknown> };
  assert.equal(lockData.lockfileVersion, 3);
  assert.ok(lockData.packages?.['']);
  for (const command of ['api', 'worker', 'migrate', 'eval', 'verify:release']) {
    assert.ok(packageData.scripts?.[command], `missing npm script ${command}`);
  }
  for (const [name, version] of Object.entries({
    ...packageData.dependencies,
    ...packageData.devDependencies,
  })) {
    assert.equal(/^[~^*]|\s|[<>|]/.test(version), false, `${name} must use an exact version`);
  }
});

test('includes architecture, activation, recovery, and evidence runbooks with explicit verification boundaries', async () => {
  const requiredFiles = [
    'apps/api/src/main.ts',
    'apps/worker/src/main.ts',
    'scripts/migrate.ts',
    'scripts/verify-release.ts',
    'docs/architecture/SYSTEM.md',
    'docs/architecture/DATA_SOURCES.md',
    'docs/runbooks/LOCAL_POSTGRES.md',
    'docs/runbooks/PROVIDER_ACTIVATION.md',
    'docs/runbooks/BACKUP_RECOVERY.md',
    'docs/release/RELEASE_CHECKLIST.md',
    'docs/release/VERIFICATION_REPORT.md',
  ];
  const content = await Promise.all(requiredFiles.map(text));
  assert.equal(content.length, requiredFiles.length);

  const dataSources = content[5]!;
  assert.ok(dataSources.includes('MassGIS Level 3'));
  assert.ok(dataSources.includes('Rhode Island'));
  assert.ok(dataSources.includes('municipality'));
  assert.ok(dataSources.includes('unknown'));

  const providerRunbook = content[7]!;
  assert.ok(providerRunbook.includes('OPENAI_API_KEY'));
  assert.ok(providerRunbook.includes('ELEVENLABS_AGENT_ID'));
  assert.ok(providerRunbook.includes('unexecuted live-account verification'));
  assert.ok(providerRunbook.includes('simulated'));
  assert.ok(providerRunbook.includes('live'));

  const recovery = content[8]!;
  assert.ok(recovery.includes('pg_dump'));
  assert.ok(recovery.includes('pg_restore'));
  assert.ok(recovery.includes('outbox'));

  const checklist = content[9]!;
  assert.ok(checklist.includes('npm run verify:release'));
  assert.ok(checklist.includes('PostgreSQL/PostGIS'));
  assert.ok(checklist.includes('provider credentials'));

  const verifier = await text('scripts/verify-release.ts');
  for (const gate of ['npm test', 'npm run typecheck', 'npm run eval', 'npm run smoke', 'git diff --check']) {
    assert.ok(verifier.includes(gate), `release verifier missing ${gate}`);
  }
  assert.ok(verifier.includes('domain import boundary'));
  assert.ok(verifier.includes('forbidden secret'));
  assert.ok(verifier.includes('migration schema'));
});
