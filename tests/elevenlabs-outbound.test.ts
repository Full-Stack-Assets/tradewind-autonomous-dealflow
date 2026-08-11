import assert from 'node:assert/strict';
import test from 'node:test';
import type { HttpRequest, HttpResponse, HttpTransport } from '../packages/ingestion/src/http.ts';
import { ElevenLabsVoiceProvider } from '../packages/voice/src/elevenlabs.ts';

class FakeTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private readonly responses: HttpResponse[];

  constructor(responses: HttpResponse[]) {
    this.responses = [...responses];
  }

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected ElevenLabs request');
    return response;
  }
}

function createProvider(transport: FakeTransport): ElevenLabsVoiceProvider {
  return new ElevenLabsVoiceProvider({
    apiKey: 'elevenlabs-secret',
    agentId: 'agent-001',
    phoneNumberId: 'phone-001',
    transport,
  });
}

test('starts an outbound call with E.164 validation, dynamic variables, and stable idempotency', async () => {
  const transport = new FakeTransport([{
    status: 200,
    headers: {},
    body: {
      success: true,
      message: 'Outbound call initiated',
      conversation_id: 'conversation-001',
      callSid: 'CA001',
    },
  }]);
  const provider = createProvider(transport);

  const result = await provider.startOutboundCall({
    toNumber: '+15085550123',
    correlationId: 'workflow-0001',
    dynamicVariables: {
      seller_name: 'Casey',
      property_id: 'property-0001',
      offer_cents: 20_000_000,
    },
  });

  assert.deepEqual(result, {
    conversationId: 'conversation-001',
    callSid: 'CA001',
    status: 'initiated',
    message: 'Outbound call initiated',
  });
  assert.equal(transport.requests.length, 1);
  const request = transport.requests[0]!;
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call');
  assert.equal(request.headers?.['xi-api-key'], 'elevenlabs-secret');
  assert.equal(request.headers?.['X-Correlation-Id'], 'workflow-0001');
  assert.equal(request.headers?.['Idempotency-Key'], 'workflow-0001:elevenlabs-outbound');
  assert.equal(request.headers?.['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body ?? '{}'), {
    agent_id: 'agent-001',
    agent_phone_number_id: 'phone-001',
    to_number: '+15085550123',
    conversation_initiation_client_data: {
      dynamic_variables: {
        seller_name: 'Casey',
        property_id: 'property-0001',
        offer_cents: 20_000_000,
      },
    },
  });
});

test('gets and normalizes a completed conversation transcript', async () => {
  const transport = new FakeTransport([{
    status: 200,
    headers: {},
    body: {
      agent_id: 'agent-001',
      conversation_id: 'conversation/001',
      status: 'done',
      metadata: {
        start_time_unix_secs: 1_786_471_200,
        call_duration_secs: 97,
      },
      transcript: [
        { role: 'agent', time_in_call_secs: 1, message: 'Hello Casey.' },
        { role: 'user', time_in_call_secs: 4, message: 'I can talk.' },
        { role: 'agent', message: 'Thank you.' },
        { role: 'system', message: 'Ignored provider metadata.' },
      ],
    },
  }]);
  const provider = createProvider(transport);

  const conversation = await provider.getConversation('conversation/001');

  assert.equal(
    transport.requests[0]?.url,
    'https://api.elevenlabs.io/v1/convai/conversations/conversation%2F001',
  );
  assert.equal(transport.requests[0]?.method, 'GET');
  assert.deepEqual(conversation, {
    conversationId: 'conversation/001',
    agentId: 'agent-001',
    status: 'done',
    startedAtUnixSeconds: 1_786_471_200,
    durationSeconds: 97,
    transcript: [
      { role: 'agent', text: 'Hello Casey.', seconds: 1 },
      { role: 'user', text: 'I can talk.', seconds: 4 },
      { role: 'agent', text: 'Thank you.' },
    ],
  });
});

test('rejects unsafe outbound inputs and malformed provider responses before progress', async () => {
  const transport = new FakeTransport([]);
  const noPhone = new ElevenLabsVoiceProvider({
    apiKey: 'key',
    agentId: 'agent-001',
    transport,
  });
  await assert.rejects(
    () => noPhone.startOutboundCall({ toNumber: '+15085550123', correlationId: 'workflow-1' }),
    /phone number ID is required/i,
  );
  await assert.rejects(
    () => createProvider(transport).startOutboundCall({
      toNumber: '508-555-0123',
      correlationId: 'workflow-1',
    }),
    /E\.164/,
  );
  assert.equal(transport.requests.length, 0);

  const mismatched = createProvider(new FakeTransport([{
    status: 200,
    headers: {},
    body: {
      agent_id: 'different-agent',
      conversation_id: 'conversation-001',
      status: 'done',
      transcript: [],
    },
  }]));
  await assert.rejects(() => mismatched.getConversation('conversation-001'), /agent ID mismatch/i);
});
