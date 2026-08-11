import type { Buyer, SourceRecord } from '../../../packages/domain/src/types.ts';
import { syntheticBuyers, syntheticPropertySource } from '../../../fixtures/synthetic-property.ts';
import { createApplicationContext } from '../../../packages/runtime/src/application.ts';
import { createApiServer } from './server.ts';

function positivePort(value: string | undefined): number {
  const port = Number(value ?? '3000');
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535');
  return port;
}

function simulationInput(input: Record<string, unknown>): { source: SourceRecord; buyers: Buyer[] } {
  const source = input.source === undefined
    ? syntheticPropertySource
    : input.source as SourceRecord;
  const buyers = input.buyers === undefined
    ? syntheticBuyers
    : input.buyers as Buyer[];
  if (source.synthetic !== true) {
    throw new Error('The simulation endpoint accepts explicitly synthetic source records only');
  }
  if (!Array.isArray(buyers) || buyers.length === 0) throw new Error('Simulation buyers must be a non-empty array');
  return { source, buyers };
}

const context = await createApplicationContext();
const apiToken = process.env.TRADEWIND_API_TOKEN?.trim() || undefined;
const server = createApiServer({
  store: context.store,
  metrics: context.metrics,
  readiness: context.readiness,
  ...(apiToken === undefined ? {} : { apiToken }),
  async createSimulation(input) {
    const started = await context.workflow.start(simulationInput(input));
    context.metrics.increment('workflow.started');
    context.metrics.setWorkflowState(started.workflowId, started.state, started.status);
    if (context.persistenceMode === 'memory') {
      const completed = await context.workflow.runToTerminal(started.workflowId);
      const checkpoint = await context.store.loadCheckpoint(started.workflowId);
      if (checkpoint) context.metrics.setWorkflowState(checkpoint.workflowId, checkpoint.state, checkpoint.status);
      return { workflowId: started.workflowId, state: checkpoint?.state, completedTransaction: completed };
    }
    return { workflowId: started.workflowId, state: started.state, status: started.status };
  },
});

const address = await server.listen(positivePort(process.env.PORT), '0.0.0.0');
process.stdout.write(`${JSON.stringify({ service: 'tradewind-api', url: address.url, persistence: context.persistenceMode, providers: context.providerMode })}\n`);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`${JSON.stringify({ service: 'tradewind-api', signal, status: 'stopping' })}\n`);
  await server.close();
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
