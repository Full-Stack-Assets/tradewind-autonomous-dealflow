import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAISellerConversationProvider } from '../packages/ai/src/openai-seller-provider.ts';

test('live OpenAI seller provider rejects explicit missing API key before network access', () => {
  assert.throws(
    () => new OpenAISellerConversationProvider({ apiKey: '' }),
    /OPENAI_API_KEY is required/,
  );
});


test('uses the balanced GPT-5.6 Terra seller model by default', () => {
  const provider = new OpenAISellerConversationProvider({ apiKey: 'test-key' });
  assert.equal(provider.model, 'gpt-5.6-terra');
});
