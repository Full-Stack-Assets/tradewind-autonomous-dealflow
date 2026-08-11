import type { Clock, IdSource } from '../../domain/src/clock.ts';
import { normalizeProperty } from '../../domain/src/normalize.ts';
import { scoreLead } from '../../domain/src/scoring.ts';
import type {
  Assignment,
  Buyer,
  Closing,
  CompletedTransaction,
  Conversation,
  EnrichmentRun,
  FeeEvent,
  LeadScore,
  Match,
  NegotiatedDeal,
  Offer,
  Property,
  ProviderCall,
  SourceRecord,
  WorkflowCheckpoint,
  WorkflowState,
} from '../../domain/src/types.ts';
import type { DomainEvent } from '../../events/src/event-store.ts';
import { matchBuyers } from '../../matching/src/match-buyers.ts';
import type {
  DealFlowTransaction,
  OutboxRecord,
  TransactionalDealFlowStore,
} from '../../persistence/src/contracts.ts';
import type {
  BuyerOutreachProvider,
  ClosingProvider,
  EnrichmentProvider,
  SellerConversationProvider,
  SignatureProvider,
} from '../../providers/src/contracts.ts';
import { ProviderFailure } from '../../providers/src/contracts.ts';
import { WorkflowException } from './deal-flow-workflow.ts';

type Runtime = Clock & IdSource;

export interface ResumableDealFlowDependencies {
  runtime: Runtime;
  store: TransactionalDealFlowStore;
  enrichment: EnrichmentProvider;
  seller: SellerConversationProvider;
  signature: SignatureProvider;
  buyerOutreach: BuyerOutreachProvider;
  closing: ClosingProvider;
}

export interface StartDealFlowInput {
  source: SourceRecord;
  buyers: Buyer[];
}

interface ResumableContext {
  source: SourceRecord;
  buyers: Buyer[];
  property: Property;
  leadScore?: LeadScore;
  enrichment?: EnrichmentRun;
  conversation?: Conversation;
  offer?: Offer;
  deal?: NegotiatedDeal;
  acquisitionEnvelopeId?: string;
  matches?: Match[];
  selectedBuyerId?: string;
  assignment?: Assignment;
  assignmentEnvelopeId?: string;
  closing?: Closing;
  fee?: FeeEvent;
}

function copyContext(context: ResumableContext): Record<string, unknown> {
  return JSON.parse(JSON.stringify(context)) as Record<string, unknown>;
}

function readContext(checkpoint: WorkflowCheckpoint): ResumableContext {
  return checkpoint.context as unknown as ResumableContext;
}

function requireValue<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw new Error(`Workflow context is missing ${name}`);
  }
  return value;
}

export class ResumableDealFlow {
  private readonly runtime: Runtime;
  private readonly store: TransactionalDealFlowStore;
  private readonly enrichment: EnrichmentProvider;
  private readonly seller: SellerConversationProvider;
  private readonly signature: SignatureProvider;
  private readonly buyerOutreach: BuyerOutreachProvider;
  private readonly closing: ClosingProvider;

  constructor(dependencies: ResumableDealFlowDependencies) {
    this.runtime = dependencies.runtime;
    this.store = dependencies.store;
    this.enrichment = dependencies.enrichment;
    this.seller = dependencies.seller;
    this.signature = dependencies.signature;
    this.buyerOutreach = dependencies.buyerOutreach;
    this.closing = dependencies.closing;
  }

  async start(input: StartDealFlowInput): Promise<WorkflowCheckpoint> {
    const workflowId = this.runtime.nextId('workflow');
    const property = normalizeProperty(input.source, this.runtime);
    const now = this.runtime.now();
    const context: ResumableContext = {
      source: input.source,
      buyers: input.buyers,
      property,
    };
    const checkpoint: WorkflowCheckpoint = {
      workflowId,
      version: 1,
      state: 'INGESTED',
      status: 'runnable',
      context: copyContext(context),
      createdAt: now,
      updatedAt: now,
    };
    const event = this.event(
      workflowId,
      'PropertyIngested',
      'Property',
      property.id,
      { parcelId: property.parcelId },
    );

    await this.store.transaction(async (tx) => {
      await tx.saveCheckpoint(checkpoint, null);
      await this.appendStageRecords(tx, workflowId, [event], []);
    });
    return checkpoint;
  }

  async runNext(workflowId: string): Promise<WorkflowCheckpoint> {
    const checkpoint = await this.store.loadCheckpoint(workflowId);
    if (!checkpoint) {
      throw new Error(`Workflow checkpoint not found: ${workflowId}`);
    }
    if (checkpoint.status === 'completed') {
      return checkpoint;
    }
    if (checkpoint.status === 'exception' || checkpoint.state === 'EXCEPTION') {
      const failure = checkpoint.failure;
      throw new WorkflowException(
        failure?.stage ?? 'EXCEPTION',
        failure?.message ?? `Workflow ${workflowId} is in exception state`,
        failure,
      );
    }

    try {
      return await this.executeStage(checkpoint);
    } catch (error) {
      const failed = await this.persistException(checkpoint, error);
      throw new WorkflowException(failed.failure?.stage ?? checkpoint.state, failed.failure?.message ?? String(error), error);
    }
  }

  async runToTerminal(workflowId: string): Promise<CompletedTransaction> {
    for (let step = 0; step < 32; step += 1) {
      const existing = await this.store.loadCompletedTransaction(workflowId);
      if (existing) {
        return existing;
      }
      const checkpoint = await this.store.loadCheckpoint(workflowId);
      if (!checkpoint) {
        throw new Error(`Workflow checkpoint not found: ${workflowId}`);
      }
      if (checkpoint.status === 'exception' || checkpoint.state === 'EXCEPTION') {
        const failure = checkpoint.failure;
        throw new WorkflowException(
          failure?.stage ?? 'EXCEPTION',
          failure?.message ?? `Workflow ${workflowId} is in exception state`,
          failure,
        );
      }
      await this.runNext(workflowId);
    }
    throw new Error(`Workflow ${workflowId} exceeded the maximum stage count`);
  }

  async resume(workflowId: string): Promise<CompletedTransaction> {
    const completed = await this.store.loadCompletedTransaction(workflowId);
    if (completed) {
      return completed;
    }
    const checkpoint = await this.store.loadCheckpoint(workflowId);
    if (!checkpoint) {
      throw new Error(`Workflow checkpoint not found: ${workflowId}`);
    }
    if (checkpoint.status === 'exception' || checkpoint.state === 'EXCEPTION') {
      const resumeState = checkpoint.failure?.stage;
      if (!resumeState || resumeState === 'EXCEPTION') {
        throw new Error(`Workflow ${workflowId} has no resumable stage`);
      }
      const { failure: _failure, ...base } = checkpoint;
      const resumed: WorkflowCheckpoint = {
        ...base,
        version: checkpoint.version + 1,
        state: resumeState,
        status: 'runnable',
        updatedAt: this.runtime.now(),
      };
      await this.store.transaction((tx) => tx.saveCheckpoint(resumed, checkpoint.version));
    }
    return this.runToTerminal(workflowId);
  }

  private async executeStage(checkpoint: WorkflowCheckpoint): Promise<WorkflowCheckpoint> {
    const context = readContext(checkpoint);
    const workflowId = checkpoint.workflowId;

    switch (checkpoint.state) {
      case 'INGESTED': {
        const leadScore = scoreLead(context.property);
        if (!leadScore.qualified) {
          throw new Error(`Lead score ${leadScore.total} is below qualification threshold`);
        }
        return this.persistTransition(
          checkpoint,
          'QUALIFIED',
          { ...context, leadScore },
          [this.event(workflowId, 'LeadQualified', 'Lead', context.property.id, { score: leadScore.total })],
        );
      }
      case 'QUALIFIED': {
        const result = await this.enrichment.enrich(context.property, this.runtime, workflowId);
        return this.persistTransition(
          checkpoint,
          'ENRICHED',
          { ...context, enrichment: result.data },
          [this.event(workflowId, 'EnrichmentCompleted', 'EnrichmentRun', result.data.id, { ownerIdentityId: result.data.owner.id })],
          [result.call],
        );
      }
      case 'ENRICHED': {
        return this.persistTransition(
          checkpoint,
          'SELLER_ENGAGED',
          context,
          [this.event(workflowId, 'OutreachStarted', 'Conversation', context.property.id, { provider: this.seller.name })],
        );
      }
      case 'SELLER_ENGAGED': {
        const enrichment = requireValue(context.enrichment, 'enrichment');
        const result = await this.seller.converse(context.property, enrichment, this.runtime, workflowId);
        if (!result.data.deal.accepted) {
          throw new Error('Seller did not accept terms');
        }
        return this.persistTransition(
          checkpoint,
          'TERMS_ACCEPTED',
          {
            ...context,
            conversation: result.data.conversation,
            offer: result.data.offer,
            deal: result.data.deal,
          },
          [
            this.event(workflowId, 'SellerQualified', 'Conversation', result.data.conversation.id, { factCount: result.data.conversation.facts.length }),
            this.event(workflowId, 'OfferGenerated', 'Offer', result.data.offer.id, { offerPriceCents: result.data.offer.offerPriceCents }),
            this.event(workflowId, 'TermsAccepted', 'NegotiatedDeal', result.data.deal.id, { acquisitionPriceCents: result.data.deal.acquisitionPriceCents }),
          ],
          [result.call],
        );
      }
      case 'TERMS_ACCEPTED': {
        const deal = requireValue(context.deal, 'negotiated deal');
        const result = await this.signature.execute('acquisition', deal.id, this.runtime, workflowId);
        return this.persistTransition(
          checkpoint,
          'ACQUISITION_EXECUTED',
          { ...context, acquisitionEnvelopeId: result.data.envelopeId },
          [this.event(workflowId, 'AcquisitionExecuted', 'NegotiatedDeal', deal.id, { envelopeId: result.data.envelopeId })],
          [result.call],
        );
      }
      case 'ACQUISITION_EXECUTED': {
        const deal = requireValue(context.deal, 'negotiated deal');
        const matches = matchBuyers(context.property, deal, context.buyers);
        if (matches.length === 0) {
          throw new Error('No eligible buyers matched');
        }
        return this.persistTransition(
          checkpoint,
          'BUYERS_MATCHED',
          { ...context, matches },
          [this.event(workflowId, 'BuyersMatched', 'MatchSet', deal.id, { buyerIds: matches.map((match) => match.buyerId) })],
        );
      }
      case 'BUYERS_MATCHED': {
        const matches = requireValue(context.matches, 'buyer matches');
        const result = await this.buyerOutreach.selectBuyer(matches, this.runtime, workflowId);
        if (!matches.some((match) => match.buyerId === result.data.buyerId)) {
          throw new Error('Buyer outreach provider selected an ineligible buyer');
        }
        return this.persistTransition(
          checkpoint,
          'BUYER_SELECTED',
          { ...context, selectedBuyerId: result.data.buyerId },
          [this.event(workflowId, 'BuyerSelected', 'Buyer', result.data.buyerId)],
          [result.call],
        );
      }
      case 'BUYER_SELECTED': {
        const deal = requireValue(context.deal, 'negotiated deal');
        const selectedBuyerId = requireValue(context.selectedBuyerId, 'selected buyer');
        const assignment: Assignment = {
          id: this.runtime.nextId('assignment'),
          schemaVersion: '1',
          createdAt: this.runtime.now(),
          dealId: deal.id,
          buyerId: selectedBuyerId,
          assignmentPriceCents: deal.assignmentPriceCents,
          status: 'executed',
        };
        const result = await this.signature.execute('assignment', assignment.id, this.runtime, workflowId);
        return this.persistTransition(
          checkpoint,
          'ASSIGNMENT_EXECUTED',
          { ...context, assignment, assignmentEnvelopeId: result.data.envelopeId },
          [this.event(workflowId, 'AssignmentExecuted', 'Assignment', assignment.id, { envelopeId: result.data.envelopeId, buyerId: selectedBuyerId })],
          [result.call],
        );
      }
      case 'ASSIGNMENT_EXECUTED': {
        const assignment = requireValue(context.assignment, 'assignment');
        const result = await this.closing.confirmClosing(assignment.id, this.runtime, workflowId);
        return this.persistTransition(
          checkpoint,
          'CLOSED',
          { ...context, closing: result.data },
          [this.event(workflowId, 'ClosingConfirmed', 'Closing', result.data.id, { closedAt: result.data.closedAt })],
          [result.call],
        );
      }
      case 'CLOSED': {
        const deal = requireValue(context.deal, 'negotiated deal');
        const enrichment = requireValue(context.enrichment, 'enrichment');
        const conversation = requireValue(context.conversation, 'conversation');
        const selectedBuyerId = requireValue(context.selectedBuyerId, 'selected buyer');
        const assignment = requireValue(context.assignment, 'assignment');
        const closing = requireValue(context.closing, 'closing');
        const assignmentFeeCents = deal.assignmentPriceCents - deal.acquisitionPriceCents;
        if (assignmentFeeCents < 0) {
          throw new Error('Assignment fee cannot be negative');
        }
        const fee: FeeEvent = {
          id: this.runtime.nextId('fee'),
          schemaVersion: '1',
          createdAt: this.runtime.now(),
          closingId: closing.id,
          amountCents: assignmentFeeCents,
        };
        const completedId = this.runtime.nextId('completed-transaction');
        const events = [
          this.event(workflowId, 'FeeRecorded', 'FeeEvent', fee.id, { amountCents: fee.amountCents }),
          this.event(workflowId, 'DealArchived', 'CompletedTransaction', completedId, { closingId: closing.id }),
        ];
        const previousEvents = await this.store.listEvents(workflowId);
        const previousCalls = await this.store.listProviderCalls(workflowId);
        const completed: CompletedTransaction = {
          id: completedId,
          schemaVersion: '1',
          createdAt: this.runtime.now(),
          workflowId,
          propertyId: context.property.id,
          ownerIdentityId: enrichment.owner.id,
          conversationId: conversation.id,
          negotiatedDealId: deal.id,
          buyerId: selectedBuyerId,
          assignmentId: assignment.id,
          closingId: closing.id,
          feeEventId: fee.id,
          assignmentFeeCents,
          eventIds: [...previousEvents.map((event) => event.eventId), ...events.map((event) => event.eventId)],
          providerCallIds: previousCalls.map((call) => call.id),
          state: 'ARCHIVED',
        };
        return this.persistTransition(
          checkpoint,
          'ARCHIVED',
          { ...context, fee },
          events,
          [],
          completed,
        );
      }
      case 'ARCHIVED':
        return checkpoint;
      case 'EXCEPTION':
        throw new Error(`Workflow ${workflowId} must be resumed before execution`);
    }
  }

  private event(
    workflowId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown> = {},
  ): DomainEvent {
    return {
      eventId: this.runtime.nextId('event'),
      workflowId,
      eventType,
      aggregateType,
      aggregateId,
      occurredAt: this.runtime.now(),
      schemaVersion: '1',
      payload,
    };
  }

  private outbox(workflowId: string, event: DomainEvent): OutboxRecord {
    return {
      id: this.runtime.nextId('outbox'),
      workflowId,
      eventId: event.eventId,
      topic: 'domain-events',
      dedupeKey: `domain-events:${event.eventId}`,
      payload: event,
      status: 'pending',
      attemptCount: 0,
      availableAt: event.occurredAt,
      createdAt: event.occurredAt,
    };
  }

  private async appendStageRecords(
    tx: DealFlowTransaction,
    workflowId: string,
    events: DomainEvent[],
    providerCalls: ProviderCall[],
  ): Promise<void> {
    if (events.length > 0) {
      await tx.appendEvents(events);
      await tx.enqueueOutbox(events.map((event) => this.outbox(workflowId, event)));
    }
    if (providerCalls.length > 0) {
      await tx.appendProviderCalls(providerCalls);
    }
  }

  private async persistTransition(
    checkpoint: WorkflowCheckpoint,
    state: WorkflowState,
    context: ResumableContext,
    events: DomainEvent[],
    providerCalls: ProviderCall[] = [],
    completed?: CompletedTransaction,
  ): Promise<WorkflowCheckpoint> {
    const { failure: _failure, ...base } = checkpoint;
    const next: WorkflowCheckpoint = {
      ...base,
      version: checkpoint.version + 1,
      state,
      status: state === 'ARCHIVED' ? 'completed' : 'runnable',
      context: copyContext(context),
      updatedAt: this.runtime.now(),
    };
    await this.store.transaction(async (tx) => {
      await tx.saveCheckpoint(next, checkpoint.version);
      await this.appendStageRecords(tx, checkpoint.workflowId, events, providerCalls);
      if (completed) {
        await tx.saveCompletedTransaction(completed);
      }
    });
    return next;
  }

  private async persistException(checkpoint: WorkflowCheckpoint, error: unknown): Promise<WorkflowCheckpoint> {
    const now = this.runtime.now();
    const failure = {
      stage: checkpoint.state,
      message: error instanceof Error ? error.message : String(error),
      retryable: error instanceof ProviderFailure,
      occurredAt: now,
      ...(error instanceof ProviderFailure ? { provider: error.provider, operation: error.operation } : {}),
    };
    const next: WorkflowCheckpoint = {
      ...checkpoint,
      version: checkpoint.version + 1,
      state: 'EXCEPTION',
      status: 'exception',
      updatedAt: now,
      failure,
    };
    await this.store.transaction((tx) => tx.saveCheckpoint(next, checkpoint.version));
    return next;
  }
}
