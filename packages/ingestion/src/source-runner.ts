import { createHash } from 'node:crypto';
import type { Clock, IdSource } from '../../domain/src/clock.ts';
import { normalizeProperty } from '../../domain/src/normalize.ts';
import type { Property, SourceRecord } from '../../domain/src/types.ts';

export interface SourceProvider {
  readonly sourceId: string;
  fetchPage(cursor?: string): Promise<{ records: SourceRecord[]; cursor?: string }>;
}

export interface SourceSnapshot {
  id: string;
  sourceId: string;
  sourceRecordId: string;
  contentHash: string;
  retrievedAt: string;
  raw: SourceRecord;
}

export interface SourceHealth {
  sourceId: string;
  status: 'unknown' | 'healthy' | 'failed';
  consecutiveFailures: number;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
}

export interface SourceStateStore {
  loadCursor(sourceId: string): Promise<string | undefined>;
  saveCursor(sourceId: string, cursor: string): Promise<void>;
  hasSnapshotHash(sourceId: string, hash: string): Promise<boolean>;
  saveSnapshot(snapshot: SourceSnapshot): Promise<void>;
  listSnapshots(sourceId: string): Promise<SourceSnapshot[]>;
  loadHealth(sourceId: string): Promise<SourceHealth | undefined>;
  saveHealth(health: SourceHealth): Promise<void>;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function contentHash(record: SourceRecord): string {
  const copy = { ...record } as Record<string, unknown>;
  delete copy.retrievedAt;
  return `sha256:${createHash('sha256').update(stable(copy)).digest('hex')}`;
}

export class InMemorySourceStateStore implements SourceStateStore {
  private readonly cursors = new Map<string, string>();
  private readonly snapshots = new Map<string, SourceSnapshot[]>();
  private readonly health = new Map<string, SourceHealth>();

  async loadCursor(sourceId: string): Promise<string | undefined> {
    return this.cursors.get(sourceId);
  }

  async saveCursor(sourceId: string, cursor: string): Promise<void> {
    this.cursors.set(sourceId, cursor);
  }

  async hasSnapshotHash(sourceId: string, hash: string): Promise<boolean> {
    return (this.snapshots.get(sourceId) ?? []).some((snapshot) => snapshot.contentHash === hash);
  }

  async saveSnapshot(snapshot: SourceSnapshot): Promise<void> {
    const records = this.snapshots.get(snapshot.sourceId) ?? [];
    records.push(clone(snapshot));
    this.snapshots.set(snapshot.sourceId, records);
  }

  async listSnapshots(sourceId: string): Promise<SourceSnapshot[]> {
    return (this.snapshots.get(sourceId) ?? []).map(clone);
  }

  async loadHealth(sourceId: string): Promise<SourceHealth | undefined> {
    const value = this.health.get(sourceId);
    return value ? clone(value) : undefined;
  }

  async saveHealth(health: SourceHealth): Promise<void> {
    this.health.set(health.sourceId, clone(health));
  }
}

export interface SourceIngestionResult {
  sourceId: string;
  newSnapshotCount: number;
  duplicateSnapshotCount: number;
  normalizedProperties: Property[];
  acceptedRecords: SourceRecord[];
  cursor?: string;
  health: SourceHealth;
}

export class SourceIngestionRunner {
  private readonly store: SourceStateStore;
  private readonly runtime: Clock & IdSource;

  constructor(store: SourceStateStore, runtime: Clock & IdSource) {
    this.store = store;
    this.runtime = runtime;
  }

  async run(provider: SourceProvider): Promise<SourceIngestionResult> {
    const now = this.runtime.now();
    const previousHealth = await this.store.loadHealth(provider.sourceId);
    const cursor = await this.store.loadCursor(provider.sourceId);
    try {
      const page = await provider.fetchPage(cursor);
      const normalizedProperties: Property[] = [];
      const acceptedRecords: SourceRecord[] = [];
      let newSnapshotCount = 0;
      let duplicateSnapshotCount = 0;
      for (const record of page.records) {
        const hash = contentHash(record);
        if (await this.store.hasSnapshotHash(provider.sourceId, hash)) {
          duplicateSnapshotCount += 1;
          continue;
        }
        const snapshot: SourceSnapshot = {
          id: this.runtime.nextId('source-snapshot'),
          sourceId: provider.sourceId,
          sourceRecordId: record.sourceRecordId ?? record.sourceId,
          contentHash: hash,
          retrievedAt: record.retrievedAt,
          raw: record,
        };
        await this.store.saveSnapshot(snapshot);
        normalizedProperties.push(normalizeProperty(record, this.runtime));
        acceptedRecords.push(clone(record));
        newSnapshotCount += 1;
      }
      if (page.cursor !== undefined) await this.store.saveCursor(provider.sourceId, page.cursor);
      const health: SourceHealth = {
        sourceId: provider.sourceId,
        status: 'healthy',
        consecutiveFailures: 0,
        lastAttemptAt: now,
        lastSuccessAt: now,
        ...(previousHealth?.lastFailureAt ? { lastFailureAt: previousHealth.lastFailureAt } : {}),
      };
      await this.store.saveHealth(health);
      return {
        sourceId: provider.sourceId,
        newSnapshotCount,
        duplicateSnapshotCount,
        normalizedProperties,
        acceptedRecords,
        ...(page.cursor === undefined ? {} : { cursor: page.cursor }),
        health,
      };
    } catch (error) {
      const health: SourceHealth = {
        sourceId: provider.sourceId,
        status: 'failed',
        consecutiveFailures: (previousHealth?.consecutiveFailures ?? 0) + 1,
        lastAttemptAt: now,
        lastFailureAt: now,
        lastError: error instanceof Error ? error.message : String(error),
        ...(previousHealth?.lastSuccessAt ? { lastSuccessAt: previousHealth.lastSuccessAt } : {}),
      };
      await this.store.saveHealth(health);
      throw error;
    }
  }
}
