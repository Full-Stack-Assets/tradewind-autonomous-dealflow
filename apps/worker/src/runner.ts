import type { Clock } from '../../../packages/domain/src/clock.ts';
import type { OutboxRecord, TransactionalDealFlowStore } from '../../../packages/persistence/src/contracts.ts';
import type { MetricsRegistry } from '../../../packages/telemetry/src/metrics.ts';
import type { ResumableDealFlow } from '../../../packages/workflows/src/resumable-deal-flow.ts';

export interface OutboxPublisher {
  publish(record: OutboxRecord): Promise<void>;
}

export interface WorkerRunnerDependencies {
  runtime: Clock;
  store: TransactionalDealFlowStore;
  workflow: ResumableDealFlow;
  metrics: MetricsRegistry;
  publisher: OutboxPublisher;
  workerId: string;
  workflowBatchSize?: number;
  outboxBatchSize?: number;
  leaseSeconds?: number;
  retryDelayMs?: number;
}

export interface OutboxDrainResult {
  claimed: number;
  published: number;
  failed: number;
}

export interface WorkerTickResult {
  claimedWorkflows: number;
  completedWorkflows: number;
  exceptionWorkflows: number;
  publishedOutbox: number;
  failedOutbox: number;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function addMilliseconds(iso: string, milliseconds: number): string {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid timestamp: ${iso}`);
  return new Date(timestamp + milliseconds).toISOString();
}

export class WorkerRunner {
  private readonly runtime: Clock;
  private readonly store: TransactionalDealFlowStore;
  private readonly workflow: ResumableDealFlow;
  private readonly metrics: MetricsRegistry;
  private readonly publisher: OutboxPublisher;
  private readonly workerId: string;
  private readonly workflowBatchSize: number;
  private readonly outboxBatchSize: number;
  private readonly leaseSeconds: number;
  private readonly retryDelayMs: number;

  constructor(dependencies: WorkerRunnerDependencies) {
    if (dependencies.workerId.trim().length === 0) throw new Error('Worker ID is required');
    this.runtime = dependencies.runtime;
    this.store = dependencies.store;
    this.workflow = dependencies.workflow;
    this.metrics = dependencies.metrics;
    this.publisher = dependencies.publisher;
    this.workerId = dependencies.workerId;
    this.workflowBatchSize = positiveInteger(dependencies.workflowBatchSize ?? 10, 'workflowBatchSize');
    this.outboxBatchSize = positiveInteger(dependencies.outboxBatchSize ?? 100, 'outboxBatchSize');
    this.leaseSeconds = positiveInteger(dependencies.leaseSeconds ?? 60, 'leaseSeconds');
    this.retryDelayMs = positiveInteger(dependencies.retryDelayMs ?? 5_000, 'retryDelayMs');
  }

  async tick(): Promise<WorkerTickResult> {
    const now = this.runtime.now();
    const claimed = await this.store.claimRunnable(
      this.workflowBatchSize,
      this.workerId,
      this.leaseSeconds,
      now,
    );
    this.metrics.increment('worker.ticks');
    this.metrics.increment('worker.workflows.claimed', claimed.length);
    let completedWorkflows = 0;
    let exceptionWorkflows = 0;

    for (const checkpoint of claimed) {
      const startedAt = Date.now();
      try {
        await this.workflow.runToTerminal(checkpoint.workflowId);
        const terminal = await this.store.loadCheckpoint(checkpoint.workflowId);
        if (terminal?.status === 'completed') {
          completedWorkflows += 1;
          this.metrics.increment('worker.workflows.completed');
          this.metrics.setWorkflowState(terminal.workflowId, terminal.state, terminal.status);
        } else if (terminal) {
          this.metrics.setWorkflowState(terminal.workflowId, terminal.state, terminal.status);
        }
      } catch {
        exceptionWorkflows += 1;
        this.metrics.increment('worker.workflows.exception');
        const failed = await this.store.loadCheckpoint(checkpoint.workflowId);
        if (failed) this.metrics.setWorkflowState(failed.workflowId, failed.state, failed.status);
      } finally {
        this.metrics.observeDuration('worker.workflow.duration_ms', Date.now() - startedAt);
        await this.store.releaseWorkflowLease(checkpoint.workflowId, this.workerId);
      }
    }

    const outbox = await this.drainOutbox();
    return {
      claimedWorkflows: claimed.length,
      completedWorkflows,
      exceptionWorkflows,
      publishedOutbox: outbox.published,
      failedOutbox: outbox.failed,
    };
  }

  async drainOutbox(): Promise<OutboxDrainResult> {
    const now = this.runtime.now();
    const claimed = await this.store.claimOutbox(
      this.outboxBatchSize,
      this.workerId,
      this.leaseSeconds,
      now,
    );
    this.metrics.increment('worker.outbox.claimed', claimed.length);
    let published = 0;
    let failed = 0;

    for (const record of claimed) {
      const startedAt = Date.now();
      try {
        await this.publisher.publish(record);
        await this.store.markOutboxPublished(record.id, this.runtime.now(), this.workerId);
        published += 1;
        this.metrics.increment('worker.outbox.published');
      } catch {
        await this.store.markOutboxFailed(
          record.id,
          'Outbox publish failed',
          addMilliseconds(this.runtime.now(), this.retryDelayMs),
          this.workerId,
        );
        failed += 1;
        this.metrics.increment('worker.outbox.failed');
      } finally {
        this.metrics.observeDuration('worker.outbox.duration_ms', Date.now() - startedAt);
      }
    }

    return { claimed: claimed.length, published, failed };
  }
}
