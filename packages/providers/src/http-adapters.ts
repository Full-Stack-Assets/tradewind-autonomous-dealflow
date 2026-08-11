import type {
  Closing,
  ContactPoint,
  EnrichmentRun,
  Match,
  OwnerIdentity,
  Property,
  ProviderCall,
} from '../../domain/src/types.ts';
import { HttpStatusError, type HttpResponse, type HttpTransport } from '../../ingestion/src/http.ts';
import type {
  BuyerOutreachProvider,
  BuyerSelectionResult,
  ClosingProvider,
  EnrichmentProvider,
  ProviderResult,
  Runtime,
  SignatureProvider,
  SignatureResult,
} from './contracts.ts';
import { ProviderFailure } from './contracts.ts';

export interface CanonicalHttpProviderOptions {
  endpoint: string;
  apiKey: string;
  transport: HttpTransport;
  timeoutMs?: number;
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

abstract class CanonicalHttpProviderBase {
  protected readonly endpoint: string;
  protected readonly apiKey: string;
  protected readonly transport: HttpTransport;
  protected readonly timeoutMs: number;
  abstract readonly name: string;

  constructor(options: CanonicalHttpProviderOptions) {
    if (!options.endpoint || options.endpoint.trim().length === 0) throw new Error('Provider endpoint is required');
    if (!options.apiKey || options.apiKey.trim().length === 0) throw new Error('Provider API key is required');
    this.endpoint = options.endpoint.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.transport = options.transport;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  protected async post(
    path: string,
    operation: string,
    correlationId: string,
    idempotencyKey: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.transport.request({
        url: `${this.endpoint}${path}`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
        timeoutMs: this.timeoutMs,
        maxAttempts: 3,
      });
      this.assertSuccess(response, operation);
      return object(response.body, `${this.name} response`);
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      if (error instanceof HttpStatusError) {
        throw new ProviderFailure(this.name, operation, `${this.name} ${operation} failed with HTTP ${error.status}`, {
          retryable: retryableStatus(error.status),
          statusCode: error.status,
        });
      }
      throw new ProviderFailure(this.name, operation, `${this.name} ${operation} request failed`, { retryable: true });
    }
  }

  protected call(runtime: Runtime, correlationId: string, operation: string): ProviderCall {
    const now = runtime.now();
    return {
      id: runtime.nextId('provider-call'),
      provider: this.name,
      operation,
      status: 'success',
      startedAt: now,
      endedAt: now,
      correlationId,
    };
  }

  private assertSuccess(response: HttpResponse, operation: string): void {
    if (response.status >= 200 && response.status < 300) return;
    throw new ProviderFailure(this.name, operation, `${this.name} ${operation} failed with HTTP ${response.status}`, {
      retryable: retryableStatus(response.status),
      statusCode: response.status,
    });
  }
}

export class CanonicalEnrichmentHttpProvider extends CanonicalHttpProviderBase implements EnrichmentProvider {
  readonly name = 'canonical-http-enrichment';

  async enrich(property: Property, runtime: Runtime, correlationId: string): Promise<ProviderResult<EnrichmentRun>> {
    const body = await this.post('/enrichment', 'enrich', correlationId, `${correlationId}:enrich:${property.id}`, { property });
    const ownerBody = object(body.owner, 'owner');
    const contactsBody = Array.isArray(ownerBody.contacts) ? ownerBody.contacts : [];
    const contacts: ContactPoint[] = contactsBody.map((contactValue) => {
      const contact = object(contactValue, 'contact');
      const typeValue = string(contact.type, 'contact.type');
      if (typeValue !== 'phone' && typeValue !== 'email' && typeValue !== 'mailing_address') throw new Error('contact.type is invalid');
      const type: ContactPoint['type'] = typeValue;
      const confidence = Number(contact.confidence);
      return {
        id: runtime.nextId('contact'),
        type,
        value: string(contact.value, 'contact.value'),
        confidence: Number.isFinite(confidence) ? confidence : 0,
        source: this.name,
      };
    });
    const entityTypeValue = ownerBody.entityType;
    const entityType: OwnerIdentity['entityType'] = entityTypeValue === 'person' || entityTypeValue === 'llc' || entityTypeValue === 'trust'
      ? entityTypeValue
      : 'unknown';
    const owner: OwnerIdentity = {
      id: runtime.nextId('owner'),
      schemaVersion: '1',
      createdAt: runtime.now(),
      displayName: string(ownerBody.displayName, 'owner.displayName'),
      entityType,
      contacts,
    };
    return {
      data: {
        id: runtime.nextId('enrichment'),
        schemaVersion: '1',
        createdAt: runtime.now(),
        propertyId: property.id,
        owner,
        provider: this.name,
      },
      call: this.call(runtime, correlationId, 'enrich'),
    };
  }
}

export class CanonicalSignatureHttpProvider extends CanonicalHttpProviderBase implements SignatureProvider {
  readonly name = 'canonical-http-signature';

  async execute(subjectType: 'acquisition' | 'assignment', subjectId: string, runtime: Runtime, correlationId: string): Promise<ProviderResult<SignatureResult>> {
    const body = await this.post('/signatures', `execute:${subjectType}`, correlationId, `${correlationId}:signature:${subjectType}:${subjectId}`, { subjectType, subjectId });
    if (body.status !== 'executed') throw new ProviderFailure(this.name, `execute:${subjectType}`, 'Signature response was not executed');
    return {
      data: { envelopeId: string(body.envelopeId, 'envelopeId'), status: 'executed', subjectType, subjectId },
      call: this.call(runtime, correlationId, `execute:${subjectType}`),
    };
  }
}

export class CanonicalBuyerOutreachHttpProvider extends CanonicalHttpProviderBase implements BuyerOutreachProvider {
  readonly name = 'canonical-http-buyer-outreach';

  async selectBuyer(matches: Match[], runtime: Runtime, correlationId: string): Promise<ProviderResult<BuyerSelectionResult>> {
    const body = await this.post('/buyer-selection', 'selectBuyer', correlationId, `${correlationId}:buyer-selection`, { matches });
    return {
      data: { buyerId: string(body.buyerId, 'buyerId') },
      call: this.call(runtime, correlationId, 'selectBuyer'),
    };
  }
}

export class CanonicalClosingHttpProvider extends CanonicalHttpProviderBase implements ClosingProvider {
  readonly name = 'canonical-http-closing';

  async confirmClosing(assignmentId: string, runtime: Runtime, correlationId: string): Promise<ProviderResult<Closing>> {
    const body = await this.post('/closings', 'confirmClosing', correlationId, `${correlationId}:closing:${assignmentId}`, { assignmentId });
    if (body.status !== 'confirmed') throw new ProviderFailure(this.name, 'confirmClosing', 'Closing response was not confirmed');
    return {
      data: {
        id: string(body.closingId, 'closingId'),
        schemaVersion: '1',
        createdAt: runtime.now(),
        assignmentId,
        status: 'confirmed',
        closedAt: string(body.closedAt, 'closedAt'),
      },
      call: this.call(runtime, correlationId, 'confirmClosing'),
    };
  }
}
