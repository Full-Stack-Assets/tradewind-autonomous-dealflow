import type { Clock, IdSource } from '../../domain/src/clock.ts';
import { normalizeProperty } from '../../domain/src/normalize.ts';
import { scoreLead } from '../../domain/src/scoring.ts';
import type {
  Assignment,
  Buyer,
  CompletedTransaction,
  FeeEvent,
  ProviderCall,
  SourceRecord,
  WorkflowState,
} from '../../domain/src/types.ts';
import type { DomainEvent } from '../../events/src/event-store.ts';
import { InMemoryEventStore } from '../../events/src/event-store.ts';
import { matchBuyers } from '../../matching/src/match-buyers.ts';
import type {
  BuyerOutreachProvider,
  ClosingProvider,
  EnrichmentProvider,
  SellerConversationProvider,
  SignatureProvider,
} from '../../providers/src/contracts.ts';
import { ProviderFailure } from '../../providers/src/contracts.ts';

type Runtime = Clock & IdSource;

interface WorkflowDependencies {
  runtime: Runtime;
  events: InMemoryEventStore;
  enrichment: EnrichmentProvider;
  seller: SellerConversationProvider;
  signature: SignatureProvider;
  buyerOutreach: BuyerOutreachProvider;
  closing: ClosingProvider;
}

export interface WorkflowFailureRecord {
  stage: WorkflowState;
  message: string;
  provider?: string;
  operation?: string;
}

export class WorkflowException extends Error {
  readonly stage: WorkflowState;
  readonly causeError: unknown;

  constructor(stage: WorkflowState, message: string, causeError: unknown) {
    super(message);
    this.name = 'WorkflowException';
    this.stage = stage;
    this.causeError = causeError;
  }
}

export class DealFlowWorkflow {
  private state: WorkflowState = 'INGESTED';
  private failure: WorkflowFailureRecord | undefined;
  private readonly runtime: Runtime;
  private readonly events: InMemoryEventStore;
  private readonly enrichment: EnrichmentProvider;
  private readonly seller: SellerConversationProvider;
  private readonly signature: SignatureProvider;
  private readonly buyerOutreach: BuyerOutreachProvider;
  private readonly closing: ClosingProvider;
  private readonly providerCalls: ProviderCall[] = [];
  private workflowId = '';

  constructor(dependencies: WorkflowDependencies) {
    this.runtime = dependencies.runtime;
    this.events = dependencies.events;
    this.enrichment = dependencies.enrichment;
    this.seller = dependencies.seller;
    this.signature = dependencies.signature;
    this.buyerOutreach = dependencies.buyerOutreach;
    this.closing = dependencies.closing;
  }

  getState(): WorkflowState {
    return this.state;
  }

  getException(): WorkflowFailureRecord | undefined {
    return this.failure ? { ...this.failure } : undefined;
  }

  private emit(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, unknown> = {},
  ): DomainEvent {
    const event: DomainEvent = {
      eventId: this.runtime.nextId('event'),
      workflowId: this.workflowId,
      eventType,
      aggregateType,
      aggregateId,
      occurredAt: this.runtime.now(),
      schemaVersion: '1',
      payload,
    };
    this.events.append(event);
    return event;
  }

  private recordCall(call: ProviderCall): void {
    this.providerCalls.push(call);
  }

  async run(source: SourceRecord, buyers: Buyer[]): Promise<CompletedTransaction> {
    this.workflowId = this.runtime.nextId('workflow');
    this.failure = undefined;
    this.providerCalls.length = 0;

    try {
      const property = normalizeProperty(source, this.runtime);
      this.state = 'INGESTED';
      this.emit('PropertyIngested', 'Property', property.id, { parcelId: property.parcelId });

      const leadScore = scoreLead(property);
      if (!leadScore.qualified) {
        throw new Error(`Lead score ${leadScore.total} is below qualification threshold`);
      }
      this.state = 'QUALIFIED';
      this.emit('LeadQualified', 'Lead', property.id, { score: leadScore.total });

      const enrichmentResult = await this.enrichment.enrich(property, this.runtime, this.workflowId);
      this.recordCall(enrichmentResult.call);
      const enrichment = enrichmentResult.data;
      this.state = 'ENRICHED';
      this.emit('EnrichmentCompleted', 'EnrichmentRun', enrichment.id, { ownerIdentityId: enrichment.owner.id });

      this.state = 'SELLER_ENGAGED';
      this.emit('OutreachStarted', 'Conversation', property.id, { provider: this.seller.name });
      const sellerResult = await this.seller.converse(property, enrichment, this.runtime, this.workflowId);
      this.recordCall(sellerResult.call);
      const seller = sellerResult.data;
      this.emit('SellerQualified', 'Conversation', seller.conversation.id, { factCount: seller.conversation.facts.length });
      this.emit('OfferGenerated', 'Offer', seller.offer.id, { offerPriceCents: seller.offer.offerPriceCents });
      if (!seller.deal.accepted) {
        throw new Error('Seller did not accept terms');
      }
      this.state = 'TERMS_ACCEPTED';
      this.emit('TermsAccepted', 'NegotiatedDeal', seller.deal.id, { acquisitionPriceCents: seller.deal.acquisitionPriceCents });

      const acquisitionSignature = await this.signature.execute('acquisition', seller.deal.id, this.runtime, this.workflowId);
      this.recordCall(acquisitionSignature.call);
      this.state = 'ACQUISITION_EXECUTED';
      this.emit('AcquisitionExecuted', 'NegotiatedDeal', seller.deal.id, { envelopeId: acquisitionSignature.data.envelopeId });

      const matches = matchBuyers(property, seller.deal, buyers);
      if (matches.length === 0) {
        throw new Error('No eligible buyers matched');
      }
      this.state = 'BUYERS_MATCHED';
      this.emit('BuyersMatched', 'MatchSet', seller.deal.id, { buyerIds: matches.map((match) => match.buyerId) });

      const buyerSelection = await this.buyerOutreach.selectBuyer(matches, this.runtime, this.workflowId);
      this.recordCall(buyerSelection.call);
      const selectedBuyerId = buyerSelection.data.buyerId;
      if (!matches.some((match) => match.buyerId === selectedBuyerId)) {
        throw new Error('Buyer outreach provider selected an ineligible buyer');
      }
      this.state = 'BUYER_SELECTED';
      this.emit('BuyerSelected', 'Buyer', selectedBuyerId, {});

      const assignment: Assignment = {
        id: this.runtime.nextId('assignment'),
        schemaVersion: '1',
        createdAt: this.runtime.now(),
        dealId: seller.deal.id,
        buyerId: selectedBuyerId,
        assignmentPriceCents: seller.deal.assignmentPriceCents,
        status: 'executed',
      };
      const assignmentSignature = await this.signature.execute('assignment', assignment.id, this.runtime, this.workflowId);
      this.recordCall(assignmentSignature.call);
      this.state = 'ASSIGNMENT_EXECUTED';
      this.emit('AssignmentExecuted', 'Assignment', assignment.id, { envelopeId: assignmentSignature.data.envelopeId, buyerId: selectedBuyerId });

      const closingResult = await this.closing.confirmClosing(assignment.id, this.runtime, this.workflowId);
      this.recordCall(closingResult.call);
      const closing = closingResult.data;
      this.state = 'CLOSED';
      this.emit('ClosingConfirmed', 'Closing', closing.id, { closedAt: closing.closedAt });

      const assignmentFeeCents = seller.deal.assignmentPriceCents - seller.deal.acquisitionPriceCents;
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
      this.emit('FeeRecorded', 'FeeEvent', fee.id, { amountCents: fee.amountCents });

      const completedId = this.runtime.nextId('completed-transaction');
      this.state = 'ARCHIVED';
      this.emit('DealArchived', 'CompletedTransaction', completedId, { closingId: closing.id });

      const allEvents = this.events.all().filter((event) => event.workflowId === this.workflowId);
      return {
        id: completedId,
        schemaVersion: '1',
        createdAt: this.runtime.now(),
        workflowId: this.workflowId,
        propertyId: property.id,
        ownerIdentityId: enrichment.owner.id,
        conversationId: seller.conversation.id,
        negotiatedDealId: seller.deal.id,
        buyerId: selectedBuyerId,
        assignmentId: assignment.id,
        closingId: closing.id,
        feeEventId: fee.id,
        assignmentFeeCents,
        eventIds: allEvents.map((event) => event.eventId),
        providerCallIds: this.providerCalls.map((call) => call.id),
        state: 'ARCHIVED',
      };
    } catch (error) {
      const failedStage = this.state;
      if (error instanceof ProviderFailure) {
        this.failure = {
          stage: failedStage,
          message: error.message,
          provider: error.provider,
          operation: error.operation,
        };
      } else {
        this.failure = {
          stage: failedStage,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      this.state = 'EXCEPTION';
      throw new WorkflowException(failedStage, this.failure.message, error);
    }
  }
}
