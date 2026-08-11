import type {
  CompletedTransaction,
  ProviderCall,
  WorkflowCheckpoint,
} from '../../domain/src/types.ts';
import type { DomainEvent } from '../../events/src/event-store.ts';

export type OutboxStatus = 'pending' | 'published' | 'failed';

export interface OutboxRecord {
  id: string;
  workflowId: string;
  eventId?: string;
  topic: string;
  dedupeKey: string;
  payload: unknown;
  status: OutboxStatus;
  attemptCount: number;
  availableAt: string;
  createdAt: string;
  publishedAt?: string;
  lastError?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
}

export interface DealFlowReader {
  loadCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | undefined>;
  listCheckpoints(): Promise<WorkflowCheckpoint[]>;
  listEvents(workflowId?: string): Promise<DomainEvent[]>;
  listProviderCalls(workflowId?: string): Promise<ProviderCall[]>;
  listOutbox(workflowId?: string): Promise<OutboxRecord[]>;
  loadCompletedTransaction(workflowId: string): Promise<CompletedTransaction | undefined>;
  listCompletedTransactions(): Promise<CompletedTransaction[]>;
}

export interface DealFlowTransaction extends DealFlowReader {
  saveCheckpoint(checkpoint: WorkflowCheckpoint, expectedVersion: number | null): Promise<void>;
  appendEvents(events: DomainEvent[]): Promise<void>;
  appendProviderCalls(calls: ProviderCall[]): Promise<void>;
  enqueueOutbox(records: OutboxRecord[]): Promise<void>;
  saveCompletedTransaction(transaction: CompletedTransaction): Promise<void>;
}

export interface TransactionalDealFlowStore extends DealFlowReader {
  transaction<T>(operation: (tx: DealFlowTransaction) => Promise<T> | T): Promise<T>;
  claimRunnable(
    limit: number,
    leaseOwner: string,
    leaseSeconds: number,
    now: string,
  ): Promise<WorkflowCheckpoint[]>;
  releaseWorkflowLease(workflowId: string, leaseOwner: string): Promise<void>;
  claimOutbox(
    limit: number,
    leaseOwner: string,
    leaseSeconds: number,
    now: string,
  ): Promise<OutboxRecord[]>;
  markOutboxPublished(id: string, publishedAt: string, leaseOwner: string): Promise<void>;
  markOutboxFailed(
    id: string,
    error: string,
    nextAttemptAt: string,
    leaseOwner: string,
  ): Promise<void>;
}

export interface SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rows: Row[];
  rowCount: number;
}

export interface SqlQueryable {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
}

export interface SqlConnection extends SqlQueryable {
  release(): void;
}

export interface SqlClient {
  connect(): Promise<SqlConnection>;
}
