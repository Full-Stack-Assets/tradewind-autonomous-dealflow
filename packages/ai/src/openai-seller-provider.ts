import type { Property, ProviderCall } from '../../domain/src/types.ts';
import type {
  ProviderResult,
  Runtime,
  SellerConversationProvider,
  SellerConversationResult,
} from '../../providers/src/contracts.ts';

export interface OpenAISellerProviderOptions {
  apiKey?: string;
  model?: string;
}

interface SellerAgentOutput {
  accepted: boolean;
  acquisitionPriceCents: number;
  assignmentPriceCents: number;
  motivation: string;
  timelineDays: number;
  transcriptSummary: string;
}

export class OpenAISellerConversationProvider implements SellerConversationProvider {
  readonly name = 'openai-agents-seller';
  private readonly apiKey: string;
  readonly model: string;

  constructor(options: OpenAISellerProviderOptions = {}) {
    const explicit = options.apiKey;
    const resolved = explicit !== undefined ? explicit : process.env.OPENAI_API_KEY;
    if (!resolved || resolved.trim().length === 0) {
      throw new Error('OPENAI_API_KEY is required for OpenAISellerConversationProvider');
    }
    this.apiKey = resolved;
    this.model = options.model ?? 'gpt-5.6-terra';
  }

  async converse(
    property: Property,
    enrichment: Parameters<SellerConversationProvider['converse']>[1],
    runtime: Runtime,
    correlationId: string,
  ): Promise<ProviderResult<SellerConversationResult>> {
    const agentsModuleName = '@openai/agents';
    const zodModuleName = 'zod';
    let agents: any;
    let zod: any;
    try {
      agents = await import(agentsModuleName);
      zod = await import(zodModuleName);
    } catch (error) {
      throw new Error(`OpenAI seller provider dependencies are not installed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (typeof agents.setDefaultOpenAIKey === 'function') {
      agents.setDefaultOpenAIKey(this.apiKey);
    }

    const capturedFacts: Array<{ key: string; value: string }> = [];
    const factTool = agents.tool({
      name: 'record_seller_fact',
      description: 'Record a seller-provided fact for the current conversation.',
      parameters: zod.z.object({ key: zod.z.string(), value: zod.z.string() }),
      execute: async (input: { key: string; value: string }) => {
        capturedFacts.push({ key: input.key, value: input.value });
        return { recorded: true };
      },
    });

    const outputType = zod.z.object({
      accepted: zod.z.boolean(),
      acquisitionPriceCents: zod.z.number().int().nonnegative(),
      assignmentPriceCents: zod.z.number().int().nonnegative(),
      motivation: zod.z.string(),
      timelineDays: zod.z.number().int().nonnegative(),
      transcriptSummary: zod.z.string(),
    });

    const agent = new agents.Agent({
      name: 'Tradewind Seller Agent',
      model: this.model,
      instructions: [
        'You are the seller acquisition reasoning layer for Tradewind.',
        'Use only the supplied property and owner context.',
        'Return structured negotiation output. Do not invent external property facts.',
        'Use record_seller_fact only for facts stated in the conversation input.',
      ].join(' '),
      tools: [factTool],
      outputType,
    });

    const prompt = JSON.stringify({
      property: {
        id: property.id,
        address1: property.address1,
        city: property.city,
        state: property.state,
        propertyType: property.propertyType,
        assessedValueCents: property.assessedValueCents,
      },
      owner: {
        id: enrichment.owner.id,
        displayName: enrichment.owner.displayName,
      },
      instruction: 'Produce a structured seller acquisition outcome for this supplied context.',
    });

    const result = await agents.run(agent, prompt);
    const output = result.finalOutput as SellerAgentOutput | undefined;
    if (!output) {
      throw new Error('OpenAI Seller Agent returned no structured output');
    }

    const now = runtime.now();
    const call: ProviderCall = {
      id: runtime.nextId('provider-call'),
      provider: this.name,
      operation: 'converse',
      status: 'success',
      startedAt: now,
      endedAt: now,
      correlationId,
    };

    const conversation = {
      id: runtime.nextId('conversation'),
      schemaVersion: '1' as const,
      createdAt: now,
      provider: this.name,
      transcript: output.transcriptSummary,
      facts: [
        { key: 'motivation', value: output.motivation, source: 'seller' as const },
        { key: 'timeline_days', value: output.timelineDays, source: 'seller' as const },
        ...capturedFacts.map((fact) => ({ key: fact.key, value: fact.value, source: 'seller' as const })),
      ],
    };
    const offer = {
      id: runtime.nextId('offer'),
      schemaVersion: '1' as const,
      createdAt: now,
      propertyId: property.id,
      offerPriceCents: output.acquisitionPriceCents,
    };
    const deal = {
      id: runtime.nextId('deal'),
      schemaVersion: '1' as const,
      createdAt: now,
      propertyId: property.id,
      sellerIdentityId: enrichment.owner.id,
      acquisitionPriceCents: output.acquisitionPriceCents,
      assignmentPriceCents: output.assignmentPriceCents,
      strategy: 'wholesale' as const,
      accepted: output.accepted,
    };

    return { data: { conversation, offer, deal }, call };
  }
}
