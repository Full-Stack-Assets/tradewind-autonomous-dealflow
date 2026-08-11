import type { Buyer } from '../../domain/src/types.ts';
import type {
  SourceIngestionResult,
  SourceIngestionRunner,
  SourceProvider,
} from '../../ingestion/src/source-runner.ts';
import type { MetricsRegistry } from '../../telemetry/src/metrics.ts';
import type { ResumableDealFlow } from './resumable-deal-flow.ts';

export interface AutonomousDealFlowSystemDependencies {
  sourceRunner: SourceIngestionRunner;
  workflow: ResumableDealFlow;
  buyers: Buyer[];
  metrics: MetricsRegistry;
}

export interface IngestAndStartResult {
  ingestion: SourceIngestionResult;
  workflowIds: string[];
}

export class AutonomousDealFlowSystem {
  private readonly sourceRunner: SourceIngestionRunner;
  private readonly workflow: ResumableDealFlow;
  private readonly buyers: Buyer[];
  private readonly metrics: MetricsRegistry;

  constructor(dependencies: AutonomousDealFlowSystemDependencies) {
    this.sourceRunner = dependencies.sourceRunner;
    this.workflow = dependencies.workflow;
    this.buyers = dependencies.buyers.map((buyer) => JSON.parse(JSON.stringify(buyer)) as Buyer);
    this.metrics = dependencies.metrics;
  }

  async ingestAndStart(provider: SourceProvider): Promise<IngestAndStartResult> {
    const startedAt = Date.now();
    const ingestion = await this.sourceRunner.run(provider);
    this.metrics.observeDuration('ingestion.run.duration_ms', Date.now() - startedAt);
    this.metrics.increment('ingestion.snapshots.new', ingestion.newSnapshotCount);
    this.metrics.increment('ingestion.snapshots.duplicate', ingestion.duplicateSnapshotCount);
    this.metrics.setSourceHealth(
      ingestion.health.sourceId,
      ingestion.health.status,
      ingestion.health.consecutiveFailures,
    );

    const workflowIds: string[] = [];
    for (const source of ingestion.acceptedRecords) {
      const checkpoint = await this.workflow.start({ source, buyers: this.buyers });
      workflowIds.push(checkpoint.workflowId);
      this.metrics.increment('workflow.started');
      this.metrics.setWorkflowState(checkpoint.workflowId, checkpoint.state, checkpoint.status);
    }
    return { ingestion, workflowIds };
  }
}
