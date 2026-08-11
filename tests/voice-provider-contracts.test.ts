import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpRequest, HttpResponse, HttpTransport } from '../packages/ingestion/src/http.ts';
import { ElevenLabsVoiceProvider } from '../packages/voice/src/elevenlabs.ts';
import { OpenAIRealtimeVoiceProvider } from '../packages/voice/src/openai-realtime.ts';

class FakeTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private readonly responses: HttpResponse[];
  private index = 0;
  constructor(responses: HttpResponse[]) { this.responses = responses; }
  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses[this.index++];
    if (!response) throw new Error('Unexpected voice request');
    return response;
  }
}

test('creates an OpenAI GA realtime client-secret session without exposing the server key', async () => {
  const transport = new FakeTransport([{ status: 200, headers: {}, body: { value: 'ek_test', expires_at: 1770000000, session: { id: 'sess-1' } } }]);
  const provider = new OpenAIRealtimeVoiceProvider({ apiKey: 'openai-secret', transport });
  const session = await provider.createSession({ correlationId: 'workflow-1', instructions: 'Qualify the supplied seller context.' });

  assert.equal(provider.model, 'gpt-realtime');
  assert.equal(session.clientSecret, 'ek_test');
  assert.equal(session.transport, 'webrtc');
  assert.equal(JSON.stringify(session).includes('openai-secret'), false);
  const request = transport.requests[0]!;
  assert.equal(request.url, 'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(request.headers?.Authorization, 'Bearer openai-secret');
  const body = JSON.parse(request.body ?? '{}') as { session?: { type?: string; model?: string } };
  assert.equal(body.session?.type, 'realtime');
  assert.equal(body.session?.model, 'gpt-realtime');
});

test('creates an authorized ElevenLabs signed WebSocket session', async () => {
  const transport = new FakeTransport([{ status: 200, headers: {}, body: { signed_url: 'wss://api.elevenlabs.io/v1/convai/conversation?token=test', conversation_id: 'conv-1' } }]);
  const provider = new ElevenLabsVoiceProvider({ apiKey: 'eleven-secret', agentId: 'agent_123', transport });
  const session = await provider.createSession({ correlationId: 'workflow-1', instructions: 'Seller outreach' });

  assert.equal(session.transport, 'websocket');
  assert.equal(session.connectionUrl.startsWith('wss://'), true);
  assert.equal(session.sessionId, 'conv-1');
  assert.equal(JSON.stringify(session).includes('eleven-secret'), false);
  const request = transport.requests[0]!;
  assert.equal(request.headers?.['xi-api-key'], 'eleven-secret');
  const url = new URL(request.url);
  assert.equal(url.searchParams.get('agent_id'), 'agent_123');
  assert.equal(url.searchParams.get('include_conversation_id'), 'true');
});

test('voice providers fail closed when credentials or agent configuration are missing', () => {
  const transport = new FakeTransport([]);
  assert.throws(() => new OpenAIRealtimeVoiceProvider({ apiKey: '', transport }), /OPENAI_API_KEY/);
  assert.throws(() => new ElevenLabsVoiceProvider({ apiKey: 'key', agentId: '', transport }), /agent ID/);
});
