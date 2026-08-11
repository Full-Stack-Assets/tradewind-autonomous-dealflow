import type {
  CompletedTransaction,
  ProviderCall,
  WorkflowCheckpoint,
} from '../../domain/src/types.ts';
import type { DomainEvent } from '../../events/src/event-store.ts';
import type {
  DealFlowTransaction,
  OutboxRecord,
  TransactionalDealFlowStore,
} from './contracts.ts';

interface StoreState {
  checkpoints: Map<string, WorkflowCheckpoint>;
  events: DomainEvent[];
  providerCalls: ProviderCall[];
  outbox: Map<string, OutboxRecord>;
  completed: Map<string, CompletedTransaction>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneState(state: StoreState): StoreState {
  return {
    checkpoints: new Map([...state.checkpoints.entries()].map(([key, value]) => [key, clone(value)])),
    events: state.events.map(clone),
    providerCalls: state.providerCalls.map(clone),
    outbox: new Map([...state.outbox.entries()].map(([key, value]) => [key, clone(value)])),
    completed: new Map([...state.completed.entries()].map(([key, value]) => [key, clone(value)])),
  };
}

function leaseExpiry(now: string, seconds: number): string {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Invalid lease timestamp: ${now}`);
  }
  return new Date(timestamp + seconds * 1000).toISOString();
}

class InMemoryTransaction implements DealFlowTransaction {
  private readonly state: StoreState;

  constructor(state: StoreState) {
    this.state = state;
  }

  async saveCheckpoint(checkpoint: WorkflowCheckpoint, expectedVersion: number | null): Promise<void> {
    const current = this.state.checkpoints.get(checkpoint.workflowId);
    if (expectedVersion === null) {
      if (current) {
        throw new Error(`Checkpoint version conflict for ${checkpoint.workflowId}: already exists`);
      }
      if (checkpoint.version !== 1) {
        throw new Error(`Checkpoint version conflict for ${checkpoint.workflowId}: first version must be 1`);
      }
    } else {
      if (!current || current.version !== expectedVersion || checkpoint.version !== expectedVersion + 1) {
        throw new Error(`Checkpoint version conflict for ${checkpoint.workflowId}`);
      }
    }
    this.state.checkpoints.set(checkpoint.workflowId, clone(checkpoint));
  }

  async loadCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | undefined> {
    const value = this.state.checkpoints.get(workflowId);
    return value ? clone(value) : undefined;
  }

  async listCheckpoints(): Promise<WorkflowCheckpoint[]> {
    return [...this.state.checkpoints.values()].map(clone);
  }

  async appendEvents(events: DomainEvent[]): Promise<void> {
    const existing = new Set(this.state.events.map((event) => event.eventId));
    for (const event of events) {
      if (existing.has(event.eventId)) {
        throw new Error(`Duplicate event id: ${event.eventId}`);
      }
      existing.add(event.eventId);
      this.state.events.push(clone(event));
    }
  }

  async listEvents(workflowId?: string): Promise<DomainEvent[]> {
    return this.state.events
      .filter((event) => workflowId === undefined || event.workflowId === workflowId)
      .map(clone);
  }

  async appendProviderCalls(calls: ProviderCall[]): Promise<void> {
    const existing = new Set(this.state.providerCalls.map((call) => call.id));
    for (const providerCall of calls) {
      if (existing.has(providerCall.id)) {
        throw new Error(`Duplicate provider call id: ${providerCall.id}`);
      }
      existing.add(providerCall.id);
      this.state.providerCalls.push(clone(providerCall));
    }
  }

  async listProviderCalls(workflowId?: string): Promise<ProviderCall[]> {
    return this.state.providerCalls
      .filter((call) => workflowId === undefined || call.correlationId === workflowId)
      .map(clone);
  }

  async enqueueOutbox(records: OutboxRecord[]): Promise<void> {
    const dedupeKeys = new Set([...this.state.outbox.values()].map((record) => record.dedupeKey));
    for (const record of records) {
      if (this.state.outbox.has(record.id)) {
        throw new Error(`Duplicate outbox id: ${record.id}`);
      }
      if (dedupeKeys.has(record.dedupeKey)) {
        throw new Error(`Duplicate outbox dedupe key: ${record.dedupeKey}`);
      }
      dedupeKeys.add(record.dedupeKey);
      this.state.outbox.set(record.id, clone(record));
    }
  }

  async listOutbox(workflowId?: string): Promise<OutboxRecord[]> {
    return [...this.state.outbox.values()]
      .filter((record) => workflowId === undefined || record.workflowId === workflowId)
      .map(clone);
  }

  async saveCompletedTransaction(transaction: CompletedTransaction): Promise<void> {
    const existing = this.state.completed.get(transaction.workflowId);
    if (existing && existing.id !== transaction.id) {
      throw new Error(`Completed transaction already exists for ${transaction.workflowId}`);
    }
    this.state.completed.set(transaction.workflowId, clone(transaction));
  }

  async loadCompletedTransaction(workflowId: string): Promise<CompletedTransaction | undefined> {
    const value = this.state.completed.get(workflowId);
    return value ? clone(value) : undefined;
  }

  async listCompletedTransactions(): Promise<CompletedTransaction[]> {
    return [...this.state.completed.values()].map(clone);
  }
}

export class InMemoryDealFlowStore implements TransactionalDealFlowStore {
  private state: StoreState = {
    checkpoints: new Map(),
    events: [],
    providerCalls: [],
    outbox: new Map(),
    completed: new Map(),
  };

  async transaction<T>(operation: (tx: DealFlowTransaction) => Promise<T> | T): Promise<T> {
    const draft = cloneState(this.state);
    const result = await operation(new InMemoryTransaction(draft));
    this.state = draft;
    return result;
  }

  private reader(): InMemoryTransaction {
    return new InMemoryTransaction(this.state);
  }

  loadCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | undefined> {
    return this.reader().loadCheckpoint(workflowId);
  }

  listCheckpoints(): Promise<WorkflowCheckpoint[]> {
    return this.reader().listCheckpoints();
  }

  listEvents(workflowId?: string): Promise<DomainEvent[]> {
    return this.reader().listEvents(workflowId);
  }

  listProviderCalls(workflowId?: string): Promise<ProviderCall[]> {
    return this.reader().listProviderCalls(workflowId);
  }

  listOutbox(workflowId?: string): Promise<OutboxRecord[]> {
    return this.reader().listOutbox(workflowId);
  }

  loadCompletedTransaction(workflowId: string): Promise<CompletedTransaction | undefined> {
    return this.reader().loadCompletedTransaction(workflowId);
  }

  listCompletedTransactions(): Promise<CompletedTransaction[]> {
    return this.reader().listCompletedTransactions();
  }

  async claimRunnable(
    limit: number,
    leaseOwner: string,
    leaseSeconds: number,
    now: string,
  ): Promise<WorkflowCheckpoint[]> {
    const claimed: WorkflowCheckpoint[] = [];
    const expiresAt = leaseExpiry(now, leaseSeconds);
    await this.transaction(async (tx) => {
      const checkpoints = (await tx.listCheckpoints())
        .filter((checkpoint) => checkpoint.status === 'runnable')
        .filter((checkpoint) => !checkpoint.nextRunAt || checkpoint.nextRunAt <= now)
        .filter((checkpoint) => !checkpoint.leaseExpiresAt || checkpoint.leaseExpiresAt <= now)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .slice(0, Math.max(0, limit));
      for (const checkpoint of checkpoints) {
        const next: WorkflowCheckpoint = {
          ...checkpoint,
          version: checkpoint.version + 1,
          updatedAt: now,
          leaseOwner,
          leaseExpiresAt: expiresAt,
        };
        await tx.saveCheckpoint(next, checkpoint.version);
        claimed.push(next);
      }
    });
    return claimed.map(clone);
  }

  async releaseWorkflowLease(workflowId: string, leaseOwner: string): Promise<void> {
    await this.transaction(async (tx) => {
      const checkpoint = await tx.loadCheckpoint(workflowId);
      if (!checkpoint || checkpoint.leaseOwner !== leaseOwner) {
        return;
      }
      const { leaseOwner: _owner, leaseExpiresAt: _expires, ...withoutLease } = checkpoint;
      await tx.saveCheckpoint(
        { ...withoutLease, version: checkpoint.version + 1 },
        checkpoint.version,
      );
    });
  }

  async claimOutbox(
    limit: number,
    leaseOwner: string,
    leaseSeconds: number,
    now: string,
  ): Promise<OutboxRecord[]> {
    const draft = cloneState(this.state);
    const expiresAt = leaseExpiry(now, leaseSeconds);
    const records = [...draft.outbox.values()]
      .filter((record) => record.status === 'pending' && record.availableAt <= now)
      .filter((record) => !record.leaseExpiresAt || record.leaseExpiresAt <= now)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, Math.max(0, limit));
    const claimed = records.map((record) => ({ ...record, leaseOwner, leaseExpiresAt: expiresAt }));
    for (const record of claimed) {
      draft.outbox.set(record.id, clone(record));
    }
    this.state = draft;
    return claimed.map(clone);
  }

  async markOutboxPublished(id: string, publishedAt: string, leaseOwner: string): Promise<void> {
    await this.updateOutboxLease(id, leaseOwner, (record) => {
      const { leaseOwner: _owner, leaseExpiresAt: _expires, ...rest } = record;
      return { ...rest, status: 'published', publishedAt };
    });
  }

  async markOutboxFailed(
    id: string,
    error: string,
    nextAttemptAt: string,
    leaseOwner: string,
  ): Promise<void> {
    await this.updateOutboxLease(id, leaseOwner, (record) => {
      const { leaseOwner: _owner, leaseExpiresAt: _expires, ...rest } = record;
      return {
        ...rest,
        status: 'pending',
        attemptCount: record.attemptCount + 1,
        availableAt: nextAttemptAt,
        lastError: error,
      };
    });
  }

  private async updateOutboxLease(
    id: string,
    leaseOwner: string,
    update: (record: OutboxRecord) => OutboxRecord,
  ): Promise<void> {
    const draft = cloneState(this.state);
    const record = draft.outbox.get(id);
    if (!record) {
      throw new Error(`Outbox record not found: ${id}`);
    }
    if (record.leaseOwner !== leaseOwner) {
      throw new Error(`Outbox lease mismatch for ${id}`);
    }
    draft.outbox.set(id, clone(update(record)));
    this.state = draft;
  }
}
