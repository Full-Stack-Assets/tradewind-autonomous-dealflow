import type {
  CompletedTransaction,
  ProviderCall,
  WorkflowCheckpoint,
  WorkflowExceptionRecord,
  WorkflowRunStatus,
  WorkflowState,
} from '../../domain/src/types.ts';
import type { DomainEvent } from '../../events/src/event-store.ts';
import type {
  DealFlowReader,
  DealFlowTransaction,
  OutboxRecord,
  OutboxStatus,
  SqlClient,
  SqlConnection,
  SqlQueryable,
  TransactionalDealFlowStore,
} from './contracts.ts';

interface CheckpointRow extends Record<string, unknown> {
  workflow_id: string;
  version: number;
  state: string;
  status: string;
  context: Record<string, unknown>;
  failure: WorkflowExceptionRecord | null;
  created_at: string | Date;
  updated_at: string | Date;
  next_run_at: string | Date | null;
  lease_owner: string | null;
  lease_expires_at: string | Date | null;
}

interface EventRow extends Record<string, unknown> {
  event_id: string;
  workflow_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  occurred_at: string | Date;
  schema_version: string;
  payload: Record<string, unknown>;
}

interface ProviderCallRow extends Record<string, unknown> {
  id: string;
  provider: string;
  operation: string;
  status: string;
  started_at: string | Date;
  ended_at: string | Date;
  correlation_id: string;
}

interface OutboxRow extends Record<string, unknown> {
  id: string;
  workflow_id: string;
  event_id: string | null;
  topic: string;
  dedupe_key: string;
  payload: unknown;
  status: string;
  attempt_count: number;
  available_at: string | Date;
  created_at: string | Date;
  published_at: string | Date | null;
  last_error: string | null;
  lease_owner: string | null;
  lease_expires_at: string | Date | null;
}

interface CompletedRow extends Record<string, unknown> {
  payload: CompletedTransaction;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function checkpointFromRow(row: CheckpointRow): WorkflowCheckpoint {
  const checkpoint: WorkflowCheckpoint = {
    workflowId: row.workflow_id,
    version: row.version,
    state: row.state as WorkflowState,
    status: row.status as WorkflowRunStatus,
    context: row.context,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (row.next_run_at) checkpoint.nextRunAt = iso(row.next_run_at);
  if (row.lease_owner) checkpoint.leaseOwner = row.lease_owner;
  if (row.lease_expires_at) checkpoint.leaseExpiresAt = iso(row.lease_expires_at);
  if (row.failure) checkpoint.failure = row.failure;
  return checkpoint;
}

function eventFromRow(row: EventRow): DomainEvent {
  return {
    eventId: row.event_id,
    workflowId: row.workflow_id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    occurredAt: iso(row.occurred_at),
    schemaVersion: row.schema_version as '1',
    payload: row.payload,
  };
}

function providerCallFromRow(row: ProviderCallRow): ProviderCall {
  return {
    id: row.id,
    provider: row.provider,
    operation: row.operation,
    status: row.status as ProviderCall['status'],
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
    correlationId: row.correlation_id,
  };
}

function outboxFromRow(row: OutboxRow): OutboxRecord {
  const record: OutboxRecord = {
    id: row.id,
    workflowId: row.workflow_id,
    topic: row.topic,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    status: row.status as OutboxStatus,
    attemptCount: row.attempt_count,
    availableAt: iso(row.available_at),
    createdAt: iso(row.created_at),
  };
  if (row.event_id) record.eventId = row.event_id;
  if (row.published_at) record.publishedAt = iso(row.published_at);
  if (row.last_error) record.lastError = row.last_error;
  if (row.lease_owner) record.leaseOwner = row.lease_owner;
  if (row.lease_expires_at) record.leaseExpiresAt = iso(row.lease_expires_at);
  return record;
}

class PostgresReader implements DealFlowReader {
  protected readonly sql: SqlQueryable;

  constructor(sql: SqlQueryable) {
    this.sql = sql;
  }

  async loadCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | undefined> {
    const result = await this.sql.query<CheckpointRow>(
      'SELECT * FROM workflow_checkpoints WHERE workflow_id = $1',
      [workflowId],
    );
    const row = result.rows[0];
    return row ? checkpointFromRow(row) : undefined;
  }

  async listCheckpoints(): Promise<WorkflowCheckpoint[]> {
    const result = await this.sql.query<CheckpointRow>(
      'SELECT * FROM workflow_checkpoints ORDER BY updated_at, workflow_id',
    );
    return result.rows.map(checkpointFromRow);
  }

  async listEvents(workflowId?: string): Promise<DomainEvent[]> {
    const result = workflowId === undefined
      ? await this.sql.query<EventRow>('SELECT * FROM domain_events ORDER BY occurred_at, event_id')
      : await this.sql.query<EventRow>(
        'SELECT * FROM domain_events WHERE workflow_id = $1 ORDER BY sequence_number',
        [workflowId],
      );
    return result.rows.map(eventFromRow);
  }

  async listProviderCalls(workflowId?: string): Promise<ProviderCall[]> {
    const result = workflowId === undefined
      ? await this.sql.query<ProviderCallRow>('SELECT * FROM provider_calls ORDER BY started_at, id')
      : await this.sql.query<ProviderCallRow>(
        'SELECT * FROM provider_calls WHERE workflow_id = $1 ORDER BY started_at, id',
        [workflowId],
      );
    return result.rows.map(providerCallFromRow);
  }

  async listOutbox(workflowId?: string): Promise<OutboxRecord[]> {
    const result = workflowId === undefined
      ? await this.sql.query<OutboxRow>('SELECT * FROM outbox ORDER BY created_at, id')
      : await this.sql.query<OutboxRow>(
        'SELECT * FROM outbox WHERE workflow_id = $1 ORDER BY created_at, id',
        [workflowId],
      );
    return result.rows.map(outboxFromRow);
  }

  async loadCompletedTransaction(workflowId: string): Promise<CompletedTransaction | undefined> {
    const result = await this.sql.query<CompletedRow>(
      'SELECT payload FROM completed_transactions WHERE workflow_id = $1',
      [workflowId],
    );
    return result.rows[0]?.payload;
  }

  async listCompletedTransactions(): Promise<CompletedTransaction[]> {
    const result = await this.sql.query<CompletedRow>(
      'SELECT payload FROM completed_transactions ORDER BY created_at, id',
    );
    return result.rows.map((row) => row.payload);
  }
}

class PostgresTransaction extends PostgresReader implements DealFlowTransaction {
  constructor(connection: SqlConnection) {
    super(connection);
  }

  async saveCheckpoint(checkpoint: WorkflowCheckpoint, expectedVersion: number | null): Promise<void> {
    if (expectedVersion === null) {
      const runResult = await this.sql.query(
        `INSERT INTO workflow_runs
          (workflow_id, state, status, input, version, created_at, updated_at, next_run_at, lease_owner, lease_expires_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING`,
        [
          checkpoint.workflowId,
          checkpoint.state,
          checkpoint.status,
          JSON.stringify(checkpoint.context),
          checkpoint.version,
          checkpoint.createdAt,
          checkpoint.updatedAt,
          checkpoint.nextRunAt ?? null,
          checkpoint.leaseOwner ?? null,
          checkpoint.leaseExpiresAt ?? null,
        ],
      );
      if (runResult.rowCount !== 1) {
        throw new Error(`Checkpoint version conflict for ${checkpoint.workflowId}: already exists`);
      }
      await this.sql.query(
        `INSERT INTO workflow_checkpoints
          (workflow_id, version, state, status, context, failure, created_at, updated_at, next_run_at, lease_owner, lease_expires_at)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11)`,
        [
          checkpoint.workflowId,
          checkpoint.version,
          checkpoint.state,
          checkpoint.status,
          JSON.stringify(checkpoint.context),
          checkpoint.failure ? JSON.stringify(checkpoint.failure) : null,
          checkpoint.createdAt,
          checkpoint.updatedAt,
          checkpoint.nextRunAt ?? null,
          checkpoint.leaseOwner ?? null,
          checkpoint.leaseExpiresAt ?? null,
        ],
      );
      return;
    }

    const runResult = await this.sql.query(
      `UPDATE workflow_runs
       SET state=$2, status=$3, version=$4, updated_at=$5, next_run_at=$6,
           lease_owner=$7, lease_expires_at=$8
       WHERE workflow_id=$1 AND version=$9`,
      [
        checkpoint.workflowId,
        checkpoint.state,
        checkpoint.status,
        checkpoint.version,
        checkpoint.updatedAt,
        checkpoint.nextRunAt ?? null,
        checkpoint.leaseOwner ?? null,
        checkpoint.leaseExpiresAt ?? null,
        expectedVersion,
      ],
    );
    if (runResult.rowCount !== 1) {
      throw new Error(`Checkpoint version conflict for ${checkpoint.workflowId}`);
    }
    const checkpointResult = await this.sql.query(
      `UPDATE workflow_checkpoints
       SET version=$2, state=$3, status=$4, context=$5::jsonb, failure=$6::jsonb,
           updated_at=$7, next_run_at=$8, lease_owner=$9, lease_expires_at=$10
       WHERE workflow_id=$1 AND version=$11`,
      [
        checkpoint.workflowId,
        checkpoint.version,
        checkpoint.state,
        checkpoint.status,
        JSON.stringify(checkpoint.context),
        checkpoint.failure ? JSON.stringify(checkpoint.failure) : null,
        checkpoint.updatedAt,
        checkpoint.nextRunAt ?? null,
        checkpoint.leaseOwner ?? null,
        checkpoint.leaseExpiresAt ?? null,
        expectedVersion,
      ],
    );
    if (checkpointResult.rowCount !== 1) {
      throw new Error(`Checkpoint version conflict for ${checkpoint.workflowId}`);
    }
  }

  async appendEvents(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.sql.query('SELECT workflow_id FROM workflow_runs WHERE workflow_id=$1 FOR UPDATE', [events[0]!.workflowId]);
    const sequenceResult = await this.sql.query<{ next_sequence: number }>(
      'SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_sequence FROM domain_events WHERE workflow_id=$1',
      [events[0]!.workflowId],
    );
    let sequence = Number(sequenceResult.rows[0]?.next_sequence ?? 1);
    for (const event of events) {
      await this.sql.query(
        `INSERT INTO domain_events
          (event_id, workflow_id, sequence_number, event_type, aggregate_type, aggregate_id, occurred_at, schema_version, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [
          event.eventId,
          event.workflowId,
          sequence,
          event.eventType,
          event.aggregateType,
          event.aggregateId,
          event.occurredAt,
          event.schemaVersion,
          JSON.stringify(event.payload),
        ],
      );
      sequence += 1;
    }
  }

  async appendProviderCalls(calls: ProviderCall[]): Promise<void> {
    for (const providerCall of calls) {
      await this.sql.query(
        `INSERT INTO provider_calls
          (id, workflow_id, provider, operation, status, started_at, ended_at, correlation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          providerCall.id,
          providerCall.correlationId,
          providerCall.provider,
          providerCall.operation,
          providerCall.status,
          providerCall.startedAt,
          providerCall.endedAt,
          providerCall.correlationId,
        ],
      );
    }
  }

  async enqueueOutbox(records: OutboxRecord[]): Promise<void> {
    for (const record of records) {
      await this.sql.query(
        `INSERT INTO outbox
          (id, workflow_id, event_id, topic, dedupe_key, payload, status, attempt_count,
           available_at, created_at, published_at, last_error, lease_owner, lease_expires_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          record.id,
          record.workflowId,
          record.eventId ?? null,
          record.topic,
          record.dedupeKey,
          JSON.stringify(record.payload),
          record.status,
          record.attemptCount,
          record.availableAt,
          record.createdAt,
          record.publishedAt ?? null,
          record.lastError ?? null,
          record.leaseOwner ?? null,
          record.leaseExpiresAt ?? null,
        ],
      );
    }
  }

  async saveCompletedTransaction(transaction: CompletedTransaction): Promise<void> {
    await this.sql.query(
      `INSERT INTO completed_transactions (id, workflow_id, payload, assignment_fee_cents, created_at)
       VALUES ($1,$2,$3::jsonb,$4,$5)
       ON CONFLICT (workflow_id) DO UPDATE
       SET payload=EXCLUDED.payload,
           assignment_fee_cents=EXCLUDED.assignment_fee_cents,
           created_at=EXCLUDED.created_at
       WHERE completed_transactions.id=EXCLUDED.id`,
      [
        transaction.id,
        transaction.workflowId,
        JSON.stringify(transaction),
        transaction.assignmentFeeCents,
        transaction.createdAt,
      ],
    );
  }
}

export class PostgresDealFlowStore extends PostgresReader implements TransactionalDealFlowStore {
  private readonly client: SqlClient;

  constructor(client: SqlClient) {
    super({
      query: async () => {
        throw new Error('PostgresDealFlowStore reader requires a connection');
      },
    });
    this.client = client;
  }

  private async read<T>(operation: (reader: PostgresReader) => Promise<T>): Promise<T> {
    const connection = await this.client.connect();
    try {
      return await operation(new PostgresReader(connection));
    } finally {
      connection.release();
    }
  }

  override loadCheckpoint(workflowId: string): Promise<WorkflowCheckpoint | undefined> {
    return this.read((reader) => reader.loadCheckpoint(workflowId));
  }

  override listCheckpoints(): Promise<WorkflowCheckpoint[]> {
    return this.read((reader) => reader.listCheckpoints());
  }

  override listEvents(workflowId?: string): Promise<DomainEvent[]> {
    return this.read((reader) => reader.listEvents(workflowId));
  }

  override listProviderCalls(workflowId?: string): Promise<ProviderCall[]> {
    return this.read((reader) => reader.listProviderCalls(workflowId));
  }

  override listOutbox(workflowId?: string): Promise<OutboxRecord[]> {
    return this.read((reader) => reader.listOutbox(workflowId));
  }

  override loadCompletedTransaction(workflowId: string): Promise<CompletedTransaction | undefined> {
    return this.read((reader) => reader.loadCompletedTransaction(workflowId));
  }

  override listCompletedTransactions(): Promise<CompletedTransaction[]> {
    return this.read((reader) => reader.listCompletedTransactions());
  }

  async transaction<T>(operation: (tx: DealFlowTransaction) => Promise<T> | T): Promise<T> {
    const connection = await this.client.connect();
    try {
      await connection.query('BEGIN');
      const result = await operation(new PostgresTransaction(connection));
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await connection.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async claimRunnable(
    limit: number,
    leaseOwner: string,
    leaseSeconds: number,
    now: string,
  ): Promise<WorkflowCheckpoint[]> {
    const connection = await this.client.connect();
    try {
      const result = await connection.query<CheckpointRow>(
        'SELECT * FROM claim_runnable_workflows($1,$2,$3,$4)',
        [limit, leaseOwner, leaseSeconds, now],
      );
      return result.rows.map(checkpointFromRow);
    } finally {
      connection.release();
    }
  }

  async releaseWorkflowLease(workflowId: string, leaseOwner: string): Promise<void> {
    const connection = await this.client.connect();
    try {
      await connection.query(
        `WITH candidate AS (
           SELECT checkpoint.workflow_id, checkpoint.version
           FROM workflow_checkpoints AS checkpoint
           WHERE checkpoint.workflow_id=$1 AND checkpoint.lease_owner=$2
           FOR UPDATE
         ), updated_runs AS (
           UPDATE workflow_runs AS run
           SET lease_owner=NULL, lease_expires_at=NULL, version=run.version+1
           FROM candidate AS checkpoint
           WHERE run.workflow_id = checkpoint.workflow_id
             AND run.version = checkpoint.version
           RETURNING run.workflow_id, run.version
         )
         UPDATE workflow_checkpoints AS checkpoint
         SET lease_owner=NULL, lease_expires_at=NULL, version=run.version
         FROM updated_runs AS run
         WHERE checkpoint.workflow_id=run.workflow_id
           AND checkpoint.version=run.version-1`,
        [workflowId, leaseOwner],
      );
    } finally {
      connection.release();
    }
  }

  async claimOutbox(
    limit: number,
    leaseOwner: string,
    leaseSeconds: number,
    now: string,
  ): Promise<OutboxRecord[]> {
    const connection = await this.client.connect();
    try {
      const result = await connection.query<OutboxRow>(
        'SELECT * FROM claim_outbox($1,$2,$3,$4)',
        [limit, leaseOwner, leaseSeconds, now],
      );
      return result.rows.map(outboxFromRow);
    } finally {
      connection.release();
    }
  }

  async markOutboxPublished(id: string, publishedAt: string, leaseOwner: string): Promise<void> {
    const connection = await this.client.connect();
    try {
      const result = await connection.query(
        `UPDATE outbox
         SET status='published', published_at=$2, lease_owner=NULL, lease_expires_at=NULL
         WHERE id=$1 AND lease_owner=$3`,
        [id, publishedAt, leaseOwner],
      );
      if (result.rowCount !== 1) throw new Error(`Outbox lease mismatch for ${id}`);
    } finally {
      connection.release();
    }
  }

  async markOutboxFailed(
    id: string,
    error: string,
    nextAttemptAt: string,
    leaseOwner: string,
  ): Promise<void> {
    const connection = await this.client.connect();
    try {
      const result = await connection.query(
        `UPDATE outbox
         SET status='pending', attempt_count=attempt_count+1, available_at=$2, last_error=$3,
             lease_owner=NULL, lease_expires_at=NULL
         WHERE id=$1 AND lease_owner=$4`,
        [id, nextAttemptAt, error, leaseOwner],
      );
      if (result.rowCount !== 1) throw new Error(`Outbox lease mismatch for ${id}`);
    } finally {
      connection.release();
    }
  }
}
