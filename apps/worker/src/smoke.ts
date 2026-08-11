import { syntheticBuyers, syntheticPropertySource } from '../../../fixtures/synthetic-property.ts';
import { DeterministicRuntime } from '../../../packages/domain/src/clock.ts';
import { InMemoryEventStore } from '../../../packages/events/src/event-store.ts';
import {
  SimulatedBuyerOutreachProvider,
  SimulatedClosingProvider,
  SimulatedEnrichmentProvider,
  SimulatedSellerConversationProvider,
  SimulatedSignatureProvider,
} from '../../../packages/providers/src/simulators.ts';
import { DealFlowWorkflow } from '../../../packages/workflows/src/deal-flow-workflow.ts';

export interface SmokeSummary {
  state: 'ARCHIVED';
  workflowId: string;
  propertyId: string;
  buyerId: string;
  assignmentFeeCents: number;
  closingStatus: 'confirmed';
  eventCount: number;
  providerCallCount: number;
}

export async function runSmoke(): Promise<SmokeSummary> {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  const events = new InMemoryEventStore();
  const workflow = new DealFlowWorkflow({
    runtime,
    events,
    enrichment: new SimulatedEnrichmentProvider(),
    seller: new SimulatedSellerConversationProvider(),
    signature: new SimulatedSignatureProvider(),
    buyerOutreach: new SimulatedBuyerOutreachProvider(),
    closing: new SimulatedClosingProvider(),
  });
  const completed = await workflow.run(syntheticPropertySource, syntheticBuyers);
  return {
    state: completed.state,
    workflowId: completed.workflowId,
    propertyId: completed.propertyId,
    buyerId: completed.buyerId,
    assignmentFeeCents: completed.assignmentFeeCents,
    closingStatus: 'confirmed',
    eventCount: completed.eventIds.length,
    providerCallCount: completed.providerCallIds.length,
  };
}

if (process.argv[1]?.endsWith('/smoke.ts')) {
  runSmoke()
    .then((summary) => process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
