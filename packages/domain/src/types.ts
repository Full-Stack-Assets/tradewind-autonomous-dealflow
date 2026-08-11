export type MoneyCents = number;
export type USState = 'MA' | 'RI';
export type PropertyType = 'single_family' | 'multi_family' | 'condo' | 'land' | 'other';
export type Strategy = 'wholesale' | 'flip' | 'rental';

export interface SourceLineage {
  sourceId: string;
  sourceType: string;
  retrievedAt: string;
  synthetic: boolean;
  sourceUrl?: string;
  sourceItemId?: string;
  sourceRecordId?: string;
}

export interface SourceRecord {
  sourceId: string;
  sourceType: string;
  retrievedAt: string;
  synthetic: boolean;
  sourceUrl?: string;
  sourceItemId?: string;
  sourceRecordId?: string;
  parcelId: string;
  address1: string;
  city: string;
  state: USState;
  postalCode: string;
  propertyType: PropertyType;
  assessedValueCents: MoneyCents;
  estimatedMortgageBalanceCents?: MoneyCents;
  ownerName: string;
  ownerMailingState: string;
  vacancyIndicator?: boolean;
  distressIndicator?: boolean;
  useCode?: string;
  zoning?: string;
  yearBuilt?: number;
  lastSalePriceCents?: MoneyCents;
  lastSaleDate?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ParcelSnapshot {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  parcelId: string;
  lineage: SourceLineage;
  raw: SourceRecord;
}

export interface Property {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  updatedAt: string;
  parcelSnapshotId: string;
  parcelId: string;
  address1: string;
  city: string;
  state: USState;
  postalCode: string;
  propertyType: PropertyType;
  assessedValueCents: MoneyCents;
  estimatedMortgageBalanceCents?: MoneyCents;
  ownerName: string;
  ownerMailingState: string;
  vacancyIndicator?: boolean;
  distressIndicator?: boolean;
  useCode?: string;
  zoning?: string;
  yearBuilt?: number;
  lastSalePriceCents?: MoneyCents;
  lastSaleDate?: string;
  rawPayload?: Record<string, unknown>;
  lineage: SourceLineage;
}

export interface LeadScore {
  total: number;
  qualified: boolean;
  components: {
    equityProxy: number;
    absenteeOwner: number;
    vacancyDistress: number;
    targetState: number;
  };
}

export interface ContactPoint {
  id: string;
  type: 'phone' | 'email' | 'mailing_address';
  value: string;
  confidence: number;
  source: string;
}

export interface OwnerIdentity {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  displayName: string;
  entityType: 'person' | 'llc' | 'trust' | 'unknown';
  contacts: ContactPoint[];
}

export interface EnrichmentRun {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  propertyId: string;
  owner: OwnerIdentity;
  provider: string;
}

export interface SellerFact {
  key: string;
  value: string | number | boolean;
  source: 'seller' | 'property_record' | 'model';
}

export interface Conversation {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  provider: string;
  transcript: string;
  facts: SellerFact[];
}

export interface Offer {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  propertyId: string;
  offerPriceCents: MoneyCents;
}

export interface NegotiatedDeal {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  propertyId: string;
  sellerIdentityId: string;
  acquisitionPriceCents: MoneyCents;
  assignmentPriceCents: MoneyCents;
  strategy: 'wholesale';
  accepted: boolean;
}

export interface BuyerBuyBox {
  states: USState[];
  propertyTypes: PropertyType[];
  strategies: Strategy[];
  maxPurchaseCents: MoneyCents;
}

export interface BuyerEvidence {
  proofOfFundsVerified: boolean;
  historicalClosings: number;
  typicalClosingDays: number;
}

export interface Buyer {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  displayName: string;
  buyBox: BuyerBuyBox;
  evidence: BuyerEvidence;
}

export interface Match {
  buyerId: string;
  fitScore: number;
  reasons: string[];
}

export interface Assignment {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  dealId: string;
  buyerId: string;
  assignmentPriceCents: MoneyCents;
  status: 'executed';
}

export interface Closing {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  assignmentId: string;
  status: 'confirmed';
  closedAt: string;
}

export interface FeeEvent {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  closingId: string;
  amountCents: MoneyCents;
}

export type WorkflowState =
  | 'INGESTED'
  | 'QUALIFIED'
  | 'ENRICHED'
  | 'SELLER_ENGAGED'
  | 'TERMS_ACCEPTED'
  | 'ACQUISITION_EXECUTED'
  | 'BUYERS_MATCHED'
  | 'BUYER_SELECTED'
  | 'ASSIGNMENT_EXECUTED'
  | 'CLOSED'
  | 'ARCHIVED'
  | 'EXCEPTION';


export interface WorkflowExceptionRecord {
  stage: WorkflowState;
  message: string;
  provider?: string;
  operation?: string;
  retryable: boolean;
  occurredAt: string;
}

export type WorkflowRunStatus = 'runnable' | 'waiting' | 'exception' | 'completed';

export interface WorkflowCheckpoint {
  workflowId: string;
  version: number;
  state: WorkflowState;
  status: WorkflowRunStatus;
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  failure?: WorkflowExceptionRecord;
}

export interface ProviderCall {
  id: string;
  provider: string;
  operation: string;
  status: 'success' | 'failure';
  startedAt: string;
  endedAt: string;
  correlationId: string;
}

export interface CompletedTransaction {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  workflowId: string;
  propertyId: string;
  ownerIdentityId: string;
  conversationId: string;
  negotiatedDealId: string;
  buyerId: string;
  assignmentId: string;
  closingId: string;
  feeEventId: string;
  assignmentFeeCents: MoneyCents;
  eventIds: string[];
  providerCallIds: string[];
  state: 'ARCHIVED';
}

export type DocumentSubjectType = 'acquisition' | 'assignment';
export type DocumentMimeType = 'text/plain';
export type DocumentInputValue = string | number | boolean;

export interface DocumentTemplate {
  id: string;
  version: string;
  subjectType: DocumentSubjectType;
  mimeType: DocumentMimeType;
  content: string;
}

export interface DocumentArtifact {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  templateId: string;
  templateVersion: string;
  subjectId: string;
  subjectType: DocumentSubjectType;
  canonicalInputs: string;
  canonicalInputHash: string;
  contentHash: string;
  mimeType: DocumentMimeType;
  byteLength: number;
  content: string;
}

export interface SignatureEnvelope {
  id: string;
  schemaVersion: '1';
  createdAt: string;
  artifactId: string;
  artifactContentHash: string;
  subjectId: string;
  subjectType: DocumentSubjectType;
  status: 'draft' | 'sent' | 'executed';
}
