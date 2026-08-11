import type { OutboxRecord } from '../../../packages/persistence/src/contracts.ts';
import { createApplicationContext } from '../../../packages/runtime/src/application.ts';
import { WorkerRunner, type OutboxPublisher } from './runner.ts';

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

class ConfiguredOutboxPublisher implements OutboxPublisher {
  private readonly endpoint = process.env.OUTBOX_WEBHOOK_URL?.trim();
  private readonly apiKey = process.env.OUTBOX_WEBHOOK_API_KEY?.trim();

  async publish(record: OutboxRecord): Promise<void> {
    if (!this.endpoint) {
      process.stdout.write(`${JSON.stringify({ service: 'tradewind-worker', outboxId: record.id, topic: record.topic, mode: 'local-sink' })}\n`);
      return;
    }
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': record.dedupeKey,
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ id: record.id, topic: record.topic, payload: record.payload }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Outbox webhook returned HTTP ${response.status}`);
  }
}

const context = await createApplicationContext();
const runner = new WorkerRunner({
  runtime: context.runtime,
  store: context.store,
  workflow: context.workflow,
  metrics: context.metrics,
  publisher: new ConfiguredOutboxPublisher(),
  workerId: `worker-${process.pid}`,
});
const pollIntervalMs = positiveInteger(process.env.WORKER_POLL_INTERVAL_MS, 2_000, 'WORKER_POLL_INTERVAL_MS');
let stopping = false;

async function tick(): Promise<void> {
  if (stopping) return;
  try {
    const result = await runner.tick();
    if (result.claimedWorkflows > 0 || result.publishedOutbox > 0 || result.failedOutbox > 0) {
      process.stdout.write(`${JSON.stringify({ service: 'tradewind-worker', ...result })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ service: 'tradewind-worker', error: error instanceof Error ? error.message : String(error) })}\n`);
  }
}

process.stdout.write(`${JSON.stringify({ service: 'tradewind-worker', persistence: context.persistenceMode, providers: context.providerMode, pollIntervalMs })}\n`);
await tick();
const timer = setInterval(() => void tick(), pollIntervalMs);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  process.stdout.write(`${JSON.stringify({ service: 'tradewind-worker', signal, status: 'stopping' })}\n`);
  await context.close();
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    void shutdown(signal).then(() => process.exit(0)).catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exit(1);
    });
  });
}
