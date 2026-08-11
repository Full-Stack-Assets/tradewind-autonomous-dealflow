import type { Clock, IdSource } from '../../domain/src/clock.ts';
import type {
  Closing,
  Conversation,
  EnrichmentRun,
  Match,
  NegotiatedDeal,
  Offer,
  Property,
  ProviderCall,
} from '../../domain/src/types.ts';

export type Runtime = Clock & IdSource;

export interface ProviderResult<T> {
  data: T;
  call: ProviderCall;
}

export interface SellerConversationResult {
  conversation: Conversation;
  offer: Offer;
  deal: NegotiatedDeal;
}

export interface SignatureResult {
  envelopeId: string;
  status: 'executed';
  subjectType: 'acquisition' | 'assignment';
  subjectId: string;
}

export interface BuyerSelectionResult {
  buyerId: string;
}

export interface EnrichmentProvider {
  readonly name: string;
  enrich(property: Property, runtime: Runtime, correlationId: string): Promise<ProviderResult<EnrichmentRun>>;
}

export interface SellerConversationProvider {
  readonly name: string;
  converse(property: Property, enrichment: EnrichmentRun, runtime: Runtime, correlationId: string): Promise<ProviderResult<SellerConversationResult>>;
}

export interface SignatureProvider {
  readonly name: string;
  execute(subjectType: 'acquisition' | 'assignment', subjectId: string, runtime: Runtime, correlationId: string): Promise<ProviderResult<SignatureResult>>;
}

export interface BuyerOutreachProvider {
  readonly name: string;
  selectBuyer(matches: Match[], runtime: Runtime, correlationId: string): Promise<ProviderResult<BuyerSelectionResult>>;
}

export interface ClosingProvider {
  readonly name: string;
  confirmClosing(assignmentId: string, runtime: Runtime, correlationId: string): Promise<ProviderResult<Closing>>;
}

export interface ProviderFailureOptions {
  retryable?: boolean;
  statusCode?: number;
}

export class ProviderFailure extends Error {
  readonly provider: string;
  readonly operation: string;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(provider: string, operation: string, message: string, options: ProviderFailureOptions = {}) {
    super(message);
    this.name = 'ProviderFailure';
    this.provider = provider;
    this.operation = operation;
    this.retryable = options.retryable ?? true;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
  }
}
