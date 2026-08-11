import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectProviderReadiness,
  type ProviderEnvironment,
} from '../packages/providers/src/readiness.ts';
import { runProviderPreflight } from '../apps/worker/src/provider-preflight.ts';

const completeEnvironment: ProviderEnvironment = {
  DATABASE_URL: 'postgres://user:database-secret@db.example.test/tradewind',
  OPENAI_API_KEY: 'openai-secret-value',
  ELEVENLABS_API_KEY: 'elevenlabs-secret-value',
  ELEVENLABS_AGENT_ID: 'agent-secret-id',
  ELEVENLABS_PHONE_NUMBER_ID: 'phone-secret-id',
  ENRICHMENT_API_URL: 'https://providers.example.test/enrichment',
  ENRICHMENT_API_KEY: 'enrichment-secret-value',
  SIGNATURE_API_URL: 'https://providers.example.test/signature',
  SIGNATURE_API_KEY: 'signature-secret-value',
  BUYER_OUTREACH_API_URL: 'https://providers.example.test/buyers',
  BUYER_OUTREACH_API_KEY: 'buyer-secret-value',
  CLOSING_API_URL: 'https://providers.example.test/closing',
  CLOSING_API_KEY: 'closing-secret-value',
  OUTBOX_WEBHOOK_URL: 'https://providers.example.test/outbox',
  OUTBOX_WEBHOOK_API_KEY: 'outbox-secret-value',
};

test('provider readiness reports configuration without leaking values or claiming live verification', () => {
  const report = inspectProviderReadiness(completeEnvironment);

  assert.equal(report.allConfigured, true);
  assert.equal(report.configuredCount, 8);
  assert.equal(report.totalCount, 8);
  assert.deepEqual(report.providers.map((provider) => provider.id), [
    'postgres',
    'openai-seller',
    'elevenlabs-voice',
    'enrichment',
    'signature',
    'buyer-outreach',
    'closing',
    'outbox-webhook',
  ]);
  assert.ok(report.providers.every((provider) => provider.configured));
  assert.ok(report.providers.every((provider) => provider.liveVerified === false));
  assert.equal(report.deferred.some((item) => item.id === 'openai-transcript-interpreter'), true);

  const serialized = JSON.stringify(report);
  for (const secret of Object.values(completeEnvironment)) {
    if (secret) assert.equal(serialized.includes(secret), false, `Preflight leaked ${secret}`);
  }
  assert.match(serialized, /OPENAI_API_KEY/);
  assert.match(serialized, /ELEVENLABS_PHONE_NUMBER_ID/);
});

test('provider readiness identifies exact missing variables and treats whitespace as absent', () => {
  const report = inspectProviderReadiness({
    DATABASE_URL: '   ',
    OPENAI_API_KEY: 'configured',
    ELEVENLABS_API_KEY: 'configured',
    ELEVENLABS_AGENT_ID: '',
    ELEVENLABS_PHONE_NUMBER_ID: 'configured',
    ENRICHMENT_API_URL: 'https://providers.example.test/enrichment',
    ENRICHMENT_API_KEY: '',
  });

  assert.equal(report.allConfigured, false);
  assert.equal(report.configuredCount, 1);
  assert.deepEqual(report.providers.find((provider) => provider.id === 'postgres')?.missingEnv, [
    'DATABASE_URL',
  ]);
  assert.deepEqual(report.providers.find((provider) => provider.id === 'elevenlabs-voice')?.missingEnv, [
    'ELEVENLABS_AGENT_ID',
  ]);
  assert.deepEqual(report.providers.find((provider) => provider.id === 'enrichment')?.missingEnv, [
    'ENRICHMENT_API_KEY',
  ]);
  assert.deepEqual(report.providers.find((provider) => provider.id === 'closing')?.missingEnv, [
    'CLOSING_API_URL',
    'CLOSING_API_KEY',
  ]);
});

test('provider preflight writes only the safe readiness report', () => {
  let output = '';
  const report = runProviderPreflight(completeEnvironment, (chunk) => {
    output += chunk;
  });

  assert.deepEqual(JSON.parse(output), report);
  assert.equal(output.includes('openai-secret-value'), false);
  assert.equal(output.includes('database-secret'), false);
  assert.equal(report.providers.every((provider) => provider.liveVerified === false), true);
});
