import type { HttpTransport } from '../../ingestion/src/http.ts';
import type { VoiceSession, VoiceSessionProvider, VoiceSessionRequest } from './contracts.ts';

export interface OpenAIRealtimeVoiceOptions {
  apiKey?: string;
  transport: HttpTransport;
  model?: string;
  endpoint?: string;
  callsEndpoint?: string;
  voice?: string;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('OpenAI Realtime response was invalid');
  return value as Record<string, unknown>;
}

export class OpenAIRealtimeVoiceProvider implements VoiceSessionProvider {
  readonly name = 'openai-realtime';
  readonly model: string;
  private readonly apiKey: string;
  private readonly transportClient: HttpTransport;
  private readonly endpoint: string;
  private readonly callsEndpoint: string;
  private readonly voice: string;

  constructor(options: OpenAIRealtimeVoiceOptions) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) throw new Error('OPENAI_API_KEY is required for OpenAI Realtime');
    this.apiKey = apiKey;
    this.transportClient = options.transport;
    this.model = options.model ?? 'gpt-realtime';
    this.endpoint = options.endpoint ?? 'https://api.openai.com/v1/realtime/client_secrets';
    this.callsEndpoint = options.callsEndpoint ?? 'https://api.openai.com/v1/realtime/calls';
    this.voice = options.voice ?? 'marin';
  }

  async createSession(request: VoiceSessionRequest): Promise<VoiceSession> {
    const response = await this.transportClient.request({
      url: this.endpoint,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Correlation-Id': request.correlationId,
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: this.model,
          instructions: request.instructions,
          audio: { output: { voice: request.voice ?? this.voice } },
          ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
        },
      }),
      timeoutMs: 15_000,
      maxAttempts: 3,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`OpenAI Realtime session failed with HTTP ${response.status}`);
    const body = object(response.body);
    if (typeof body.value !== 'string' || !body.value.startsWith('ek_')) throw new Error('OpenAI Realtime response omitted client secret');
    const sessionBody = typeof body.session === 'object' && body.session !== null ? body.session as Record<string, unknown> : {};
    const expiresAt = typeof body.expires_at === 'number' ? new Date(body.expires_at * 1000).toISOString() : undefined;
    return {
      provider: this.name,
      model: this.model,
      status: 'ready',
      transport: 'webrtc',
      connectionUrl: this.callsEndpoint,
      clientSecret: body.value,
      ...(typeof sessionBody.id === 'string' ? { sessionId: sessionBody.id } : {}),
      ...(expiresAt === undefined ? {} : { expiresAt }),
    };
  }
}
