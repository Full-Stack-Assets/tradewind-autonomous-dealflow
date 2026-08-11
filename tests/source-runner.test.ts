import assert from 'node:assert/strict';
import test from 'node:test';
import { syntheticPropertySource } from '../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../packages/domain/src/clock.ts';
import {
  InMemorySourceStateStore,
  SourceIngestionRunner,
  type SourceProvider,
} from '../packages/ingestion/src/source-runner.ts';

class SequencedProvider implements SourceProvider {
  readonly sourceId = 'source-test';
  private attempt = 0;

  async fetchPage(cursor?: string) {
    this.attempt += 1;
    if (this.attempt === 3) throw new Error('temporary source failure');
    return {
      records: [{ ...syntheticPropertySource, sourceRecordId: 'record-1' }],
      cursor: cursor === undefined ? 'cursor-1' : `cursor-${this.attempt}`,
    };
  }
}

test('persists cursors, suppresses duplicate snapshots, and recovers source health', async () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const store = new InMemorySourceStateStore();
  const runner = new SourceIngestionRunner(store, runtime);
  const provider = new SequencedProvider();

  const first = await runner.run(provider);
  assert.equal(first.newSnapshotCount, 1);
  assert.equal(first.normalizedProperties.length, 1);
  assert.equal(await store.loadCursor(provider.sourceId), 'cursor-1');

  const duplicate = await runner.run(provider);
  assert.equal(duplicate.newSnapshotCount, 0);
  assert.equal(duplicate.duplicateSnapshotCount, 1);

  await assert.rejects(() => runner.run(provider), /temporary source failure/);
  const failed = await store.loadHealth(provider.sourceId);
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.consecutiveFailures, 1);

  const recovered = await runner.run(provider);
  assert.equal(recovered.newSnapshotCount, 0);
  const healthy = await store.loadHealth(provider.sourceId);
  assert.equal(healthy?.status, 'healthy');
  assert.equal(healthy?.consecutiveFailures, 0);
  assert.equal(healthy?.lastSuccessAt, '2026-08-11T16:00:00.000Z');
});
