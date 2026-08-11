# Provider Activation Runbook

The default mode is **simulated**. It proves the complete workflow without external calls. To use **live** adapters, set `TRADEWIND_PROVIDER_MODE=live` and provide all required names below through a secret manager or untracked environment file:

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_AGENT_ID`
- `ENRICHMENT_API_URL`, `ENRICHMENT_API_KEY`
- `SIGNATURE_API_URL`, `SIGNATURE_API_KEY`
- `BUYER_OUTREACH_API_URL`, `BUYER_OUTREACH_API_KEY`
- `CLOSING_API_URL`, `CLOSING_API_KEY`

Run `npm run preflight:providers` before any authenticated smoke. The preflight reports only configuration presence and missing environment-variable names; it never prints values and always leaves `liveVerified` false. `ELEVENLABS_PHONE_NUMBER_ID` is additionally required for outbound calls.

The OpenAI transcript interpreter is intentionally deferred by the operator and must not be represented as configured or live verified.

The seller reasoning adapter defaults to `gpt-5.6-terra`. The OpenAI voice boundary defaults to `gpt-realtime-2.1`. ElevenLabs voice requires both its API key and agent ID. The durable workflow uses the seller reasoning provider plus enrichment, signature, buyer-outreach, and closing providers; voice-session adapters are independently activation-ready.

## Verification boundary

Local contract tests verify payload mapping, timeouts, retries, redaction, idempotency headers, and response validation. Until each real account accepts an authenticated request and its result is captured, the status remains **unexecuted live-account verification**. Never convert simulated success into a live-provider claim.
