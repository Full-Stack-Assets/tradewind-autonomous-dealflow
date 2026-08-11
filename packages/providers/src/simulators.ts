import type {
  BuyerOutreachProvider,
  ClosingProvider,
  EnrichmentProvider,
  ProviderResult,
  Runtime,
  SellerConversationProvider,
  SellerConversationResult,
  SignatureProvider,
  SignatureResult,
  BuyerSelectionResult,
} from './contracts.ts';
import { ProviderFailure } from './contracts.ts';
import type {
  Closing,
  EnrichmentRun,
  Match,
  Property,
  ProviderCall,
} from '../../domain/src/types.ts';

function call(runtime: Runtime, correlationId: string, provider: string, operation: string): ProviderCall {
  const now = runtime.now();
  return {
    id: runtime.nextId('provider-call'),
    provider,
    operation,
    status: 'success',
    startedAt: now,
    endedAt: now,
    correlationId,
  };
}

export class SimulatedEnrichmentProvider implements EnrichmentProvider {
  readonly name = 'simulated-enrichment';

  async enrich(property: Property, runtime: Runtime, correlationId: string): Promise<ProviderResult<EnrichmentRun>> {
    const ownerId = runtime.nextId('owner');
    const data: EnrichmentRun = {
      id: runtime.nextId('enrichment'),
      schemaVersion: '1',
      createdAt: runtime.now(),
      propertyId: property.id,
      provider: this.name,
      owner: {
        id: ownerId,
        schemaVersion: '1',
        createdAt: runtime.now(),
        displayName: property.ownerName,
        entityType: 'person',
        contacts: [
          { id: runtime.nextId('contact'), type: 'phone', value: '+15555550101', confidence: 0.99, source: this.name },
          { id: runtime.nextId('contact'), type: 'email', value: 'synthetic.seller@example.test', confidence: 0.99, source: this.name },
        ],
      },
    };
    return { data, call: call(runtime, correlationId, this.name, 'enrich') };
  }
}

export class SimulatedSellerConversationProvider implements SellerConversationProvider {
  readonly name = 'simulated-seller-conversation';

  async converse(property: Property, enrichment: EnrichmentRun, runtime: Runtime, correlationId: string): Promise<ProviderResult<SellerConversationResult>> {
    const conversation = {
      id: runtime.nextId('conversation'),
      schemaVersion: '1' as const,
      createdAt: runtime.now(),
      provider: this.name,
      transcript: 'Synthetic seller conversation accepted deterministic test terms.',
      facts: [
        { key: 'motivation', value: 'synthetic-test-motivation', source: 'seller' as const },
        { key: 'timeline_days', value: 21, source: 'seller' as const },
      ],
    };
    const offer = {
      id: runtime.nextId('offer'),
      schemaVersion: '1' as const,
      createdAt: runtime.now(),
      propertyId: property.id,
      offerPriceCents: 23_000_000,
    };
    const deal = {
      id: runtime.nextId('deal'),
      schemaVersion: '1' as const,
      createdAt: runtime.now(),
      propertyId: property.id,
      sellerIdentityId: enrichment.owner.id,
      acquisitionPriceCents: offer.offerPriceCents,
      assignmentPriceCents: 25_000_000,
      strategy: 'wholesale' as const,
      accepted: true,
    };
    return { data: { conversation, offer, deal }, call: call(runtime, correlationId, this.name, 'converse') };
  }
}

export class SimulatedSignatureProvider implements SignatureProvider {
  readonly name = 'simulated-signature';

  async execute(subjectType: 'acquisition' | 'assignment', subjectId: string, runtime: Runtime, correlationId: string): Promise<ProviderResult<SignatureResult>> {
    return {
      data: {
        envelopeId: runtime.nextId('envelope'),
        status: 'executed',
        subjectType,
        subjectId,
      },
      call: call(runtime, correlationId, this.name, `execute:${subjectType}`),
    };
  }
}

export class SimulatedBuyerOutreachProvider implements BuyerOutreachProvider {
  readonly name = 'simulated-buyer-outreach';

  async selectBuyer(matches: Match[], runtime: Runtime, correlationId: string): Promise<ProviderResult<BuyerSelectionResult>> {
    const selected = matches[0];
    if (!selected) {
      throw new ProviderFailure(this.name, 'selectBuyer', 'No eligible buyers were provided');
    }
    return {
      data: { buyerId: selected.buyerId },
      call: call(runtime, correlationId, this.name, 'selectBuyer'),
    };
  }
}

export class SimulatedClosingProvider implements ClosingProvider {
  readonly name = 'simulated-closing';

  async confirmClosing(assignmentId: string, runtime: Runtime, correlationId: string): Promise<ProviderResult<Closing>> {
    const data: Closing = {
      id: runtime.nextId('closing'),
      schemaVersion: '1',
      createdAt: runtime.now(),
      assignmentId,
      status: 'confirmed',
      closedAt: runtime.now(),
    };
    return { data, call: call(runtime, correlationId, this.name, 'confirmClosing') };
  }
}
