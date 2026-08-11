export interface VoiceSessionRequest {
  correlationId: string;
  instructions: string;
  voice?: string;
  metadata?: Record<string, string>;
}

export interface VoiceSession {
  provider: string;
  model: string;
  status: 'ready';
  transport: 'webrtc' | 'websocket';
  connectionUrl: string;
  sessionId?: string;
  clientSecret?: string;
  expiresAt?: string;
}

export interface VoiceSessionProvider {
  readonly name: string;
  createSession(request: VoiceSessionRequest): Promise<VoiceSession>;
}

export type VoiceDynamicValue = string | number | boolean;

export interface OutboundVoiceCallRequest {
  toNumber: string;
  correlationId: string;
  dynamicVariables?: Record<string, VoiceDynamicValue>;
  callRecordingEnabled?: boolean;
}

export interface OutboundVoiceCallResult {
  conversationId: string;
  callSid?: string;
  status: 'initiated';
  message?: string;
}

export interface VoiceTranscriptTurn {
  role: 'agent' | 'user';
  text: string;
  seconds?: number;
}

export interface VoiceConversation {
  conversationId: string;
  agentId: string;
  status: string;
  startedAtUnixSeconds?: number;
  durationSeconds?: number;
  transcript: VoiceTranscriptTurn[];
}

export interface OutboundVoiceProvider {
  startOutboundCall(request: OutboundVoiceCallRequest): Promise<OutboundVoiceCallResult>;
  getConversation(conversationId: string): Promise<VoiceConversation>;
}
