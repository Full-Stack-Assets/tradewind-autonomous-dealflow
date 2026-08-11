import type { HttpTransport } from '../../ingestion/src/http.ts';
import type {
  OutboundVoiceCallRequest,
  OutboundVoiceCallResult,
  OutboundVoiceProvider,
  VoiceConversation,
  VoiceSession,
  VoiceSessionProvider,
  VoiceSessionRequest,
  VoiceTranscriptTurn,
} from './contracts.ts';

export interface ElevenLabsVoiceOptions {
  apiKey?: string;
  agentId?: string;
  phoneNumberId?: string;
  transport: HttpTransport;
  endpoint?: string;
  apiBaseUrl?: string;
  environment?: string;
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(message);
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNonnegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function normalizeTranscript(value: unknown): VoiceTranscriptTurn[] {
  if (!Array.isArray(value)) return [];
  const transcript: VoiceTranscriptTurn[] = [];
  for (const [index, rawTurn] of value.entries()) {
    const turn = object(rawTurn, `ElevenLabs transcript turn ${index} was invalid`);
    if (turn.role !== 'agent' && turn.role !== 'user') continue;
    const text = requiredString(turn.message, `ElevenLabs transcript turn ${index} message is required`);
    const seconds = optionalNonnegativeNumber(turn.time_in_call_secs);
    transcript.push({ role: turn.role, text, ...(seconds === undefined ? {} : { seconds }) });
  }
  return transcript;
}

export class ElevenLabsVoiceProvider implements VoiceSessionProvider, OutboundVoiceProvider {
  readonly name = 'elevenlabs-conversational-ai';
  private readonly apiKey: string;
  private readonly agentId: string;
  private readonly phoneNumberId: string | undefined;
  private readonly transportClient: HttpTransport;
  private readonly endpoint: string;
  private readonly apiBaseUrl: string;
  private readonly environment: string;

  constructor(options: ElevenLabsVoiceOptions) {
    const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
    const agentId = options.agentId ?? process.env.ELEVENLABS_AGENT_ID;
    if (!apiKey || apiKey.trim().length === 0) throw new Error('ELEVENLABS_API_KEY is required');
    if (!agentId || agentId.trim().length === 0) throw new Error('ElevenLabs agent ID is required');
    this.apiKey = apiKey;
    this.agentId = agentId;
    this.phoneNumberId = options.phoneNumberId ?? process.env.ELEVENLABS_PHONE_NUMBER_ID;
    this.transportClient = options.transport;
    this.endpoint = options.endpoint ?? 'https://api.elevenlabs.io/v1/convai/conversation/get-signed-url';
    this.apiBaseUrl = (options.apiBaseUrl ?? 'https://api.elevenlabs.io').replace(/\/+$/, '');
    if (!this.apiBaseUrl.startsWith('https://')) throw new Error('ElevenLabs API base URL must use HTTPS');
    this.environment = options.environment ?? 'production';
  }

  async createSession(request: VoiceSessionRequest): Promise<VoiceSession> {
    const url = new URL(this.endpoint);
    url.searchParams.set('agent_id', this.agentId);
    url.searchParams.set('include_conversation_id', 'true');
    url.searchParams.set('environment', this.environment);
    const response = await this.transportClient.request({
      url: url.toString(),
      headers: {
        'xi-api-key': this.apiKey,
        'X-Correlation-Id': request.correlationId,
      },
      timeoutMs: 15_000,
      maxAttempts: 3,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`ElevenLabs signed URL failed with HTTP ${response.status}`);
    if (typeof response.body !== 'object' || response.body === null || Array.isArray(response.body)) throw new Error('ElevenLabs response was invalid');
    const body = response.body as Record<string, unknown>;
    if (typeof body.signed_url !== 'string' || !body.signed_url.startsWith('wss://')) throw new Error('ElevenLabs response omitted signed URL');
    return {
      provider: this.name,
      model: 'elevenlabs-agent',
      status: 'ready',
      transport: 'websocket',
      connectionUrl: body.signed_url,
      ...(typeof body.conversation_id === 'string' ? { sessionId: body.conversation_id } : {}),
    };
  }

  async startOutboundCall(request: OutboundVoiceCallRequest): Promise<OutboundVoiceCallResult> {
    const phoneNumberId = requiredString(
      this.phoneNumberId,
      'ElevenLabs phone number ID is required for outbound calls',
    );
    const toNumber = requiredString(request.toNumber, 'ElevenLabs destination number is required');
    if (!/^\+[1-9]\d{7,14}$/.test(toNumber)) {
      throw new Error('ElevenLabs destination number must use E.164 format');
    }
    const correlationId = requiredString(
      request.correlationId,
      'ElevenLabs correlation ID is required',
    );
    const response = await this.transportClient.request({
      url: `${this.apiBaseUrl}/v1/convai/twilio/outbound-call`,
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        'Idempotency-Key': `${correlationId}:elevenlabs-outbound`,
      },
      body: JSON.stringify({
        agent_id: this.agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: toNumber,
        ...(request.dynamicVariables === undefined
          ? {}
          : {
              conversation_initiation_client_data: {
                dynamic_variables: { ...request.dynamicVariables },
              },
            }),
        ...(request.callRecordingEnabled === undefined
          ? {}
          : { call_recording_enabled: request.callRecordingEnabled }),
      }),
      timeoutMs: 15_000,
      maxAttempts: 3,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ElevenLabs outbound call failed with HTTP ${response.status}`);
    }
    const body = object(response.body, 'ElevenLabs outbound call response was invalid');
    if (body.success !== true) {
      throw new Error(optionalString(body.message) ?? 'ElevenLabs outbound call was not accepted');
    }
    const conversationId = requiredString(
      body.conversation_id,
      'ElevenLabs conversation ID is required',
    );
    const callSid = optionalString(body.callSid ?? body.call_sid);
    const message = optionalString(body.message);
    return {
      conversationId,
      ...(callSid === undefined ? {} : { callSid }),
      status: 'initiated',
      ...(message === undefined ? {} : { message }),
    };
  }

  async getConversation(conversationId: string): Promise<VoiceConversation> {
    const normalizedId = requiredString(conversationId, 'ElevenLabs conversation ID is required');
    const response = await this.transportClient.request({
      url: `${this.apiBaseUrl}/v1/convai/conversations/${encodeURIComponent(normalizedId)}`,
      method: 'GET',
      headers: { 'xi-api-key': this.apiKey },
      timeoutMs: 15_000,
      maxAttempts: 3,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`ElevenLabs conversation retrieval failed with HTTP ${response.status}`);
    }
    const body = object(response.body, 'ElevenLabs conversation response was invalid');
    const responseConversationId = requiredString(
      body.conversation_id,
      'ElevenLabs conversation ID is required',
    );
    if (responseConversationId !== normalizedId) throw new Error('ElevenLabs conversation ID mismatch');
    const responseAgentId = requiredString(body.agent_id, 'ElevenLabs agent ID is required');
    if (responseAgentId !== this.agentId) throw new Error('ElevenLabs agent ID mismatch');
    const metadata = body.metadata === undefined
      ? {}
      : object(body.metadata, 'ElevenLabs conversation metadata was invalid');
    const startedAtUnixSeconds = optionalNonnegativeNumber(metadata.start_time_unix_secs);
    const durationSeconds = optionalNonnegativeNumber(metadata.call_duration_secs);
    return {
      conversationId: responseConversationId,
      agentId: responseAgentId,
      status: requiredString(body.status, 'ElevenLabs conversation status is required'),
      ...(startedAtUnixSeconds === undefined ? {} : { startedAtUnixSeconds }),
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      transcript: normalizeTranscript(body.transcript),
    };
  }
}
