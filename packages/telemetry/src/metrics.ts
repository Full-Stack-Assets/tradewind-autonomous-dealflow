import type { WorkflowRunStatus, WorkflowState } from '../../domain/src/types.ts';
import type { SourceHealth } from '../../ingestion/src/source-runner.ts';

export interface DurationSummary {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  averageMs: number;
}

export interface MetricsSnapshot {
  counters: Readonly<Record<string, number>>;
  durations: Readonly<Record<string, Readonly<DurationSummary>>>;
  workflows: Readonly<Record<string, Readonly<{ state: WorkflowState; status: WorkflowRunStatus }>>>;
  sources: Readonly<Record<string, Readonly<Pick<SourceHealth, 'status' | 'consecutiveFailures'>>>>;
}

interface DurationAccumulator {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

function assertName(name: string): void {
  if (name.trim().length === 0) throw new Error('Metric name is required');
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<string, DurationAccumulator>();
  private readonly workflows = new Map<string, { state: WorkflowState; status: WorkflowRunStatus }>();
  private readonly sources = new Map<string, Pick<SourceHealth, 'status' | 'consecutiveFailures'>>();

  increment(name: string, amount = 1): void {
    assertName(name);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Counter increment must be finite and non-negative');
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observeDuration(name: string, durationMs: number): void {
    assertName(name);
    if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('Duration must be finite and non-negative');
    const current = this.durations.get(name);
    if (!current) {
      this.durations.set(name, { count: 1, totalMs: durationMs, minMs: durationMs, maxMs: durationMs });
      return;
    }
    current.count += 1;
    current.totalMs += durationMs;
    current.minMs = Math.min(current.minMs, durationMs);
    current.maxMs = Math.max(current.maxMs, durationMs);
  }

  setWorkflowState(workflowId: string, state: WorkflowState, status: WorkflowRunStatus): void {
    if (workflowId.trim().length === 0) throw new Error('Workflow ID is required');
    this.workflows.set(workflowId, { state, status });
  }

  setSourceHealth(sourceId: string, status: SourceHealth['status'], consecutiveFailures: number): void {
    if (sourceId.trim().length === 0) throw new Error('Source ID is required');
    if (!Number.isSafeInteger(consecutiveFailures) || consecutiveFailures < 0) {
      throw new Error('Source consecutive failures must be a non-negative integer');
    }
    this.sources.set(sourceId, { status, consecutiveFailures });
  }

  snapshot(): MetricsSnapshot {
    const counters = Object.fromEntries([...this.counters.entries()].sort(([a], [b]) => a.localeCompare(b)));
    const durations = Object.fromEntries([...this.durations.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => [name, {
        count: value.count,
        totalMs: value.totalMs,
        minMs: value.minMs,
        maxMs: value.maxMs,
        averageMs: value.totalMs / value.count,
      }]));
    const workflows = Object.fromEntries([...this.workflows.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, value]) => [id, { ...value }]));
    const sources = Object.fromEntries([...this.sources.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, value]) => [id, { ...value }]));
    return deepFreeze({ counters, durations, workflows, sources });
  }
}
