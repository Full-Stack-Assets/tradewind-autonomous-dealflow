# Tradewind Autonomous DealFlow Verification Report

- Generated: 2026-08-11T18:44:25.195Z
- Verified commit: `0f97674724aac415037bb4372e654200d4882f9c`
- Overall result: **PASS**
- Gates: 9/9 passed

## Local verification gates

| Result | Gate | Command | Duration (ms) |
|---|---|---|---:|
| PASS | unit and acceptance tests | `npm test` | 1357 |
| PASS | TypeScript typecheck | `npm run typecheck` | 360 |
| PASS | evaluation matrix | `npm run eval` | 318 |
| PASS | offline lifecycle smoke | `npm run smoke` | 300 |
| PASS | migration check command | `npm run migrate -- --check` | 272 |
| PASS | git diff --check | `git diff --check` | 5 |
| PASS | domain import boundary | `domain import boundary` | 0 |
| PASS | forbidden secret scan | `forbidden secret scan` | 0 |
| PASS | migration schema scan | `migration schema scan` | 0 |

## Verification boundaries

- PostgreSQL/PostGIS: unexecuted live PostgreSQL/PostGIS verification
- OpenAI: unexecuted live-account verification
- ElevenLabs: unexecuted live-account verification
- Enrichment/e-sign/buyer-outreach/closing: unexecuted live-account verification; deterministic and HTTP contract tests executed locally

The default local verification path is intentionally credential-free and network-free. Passing it proves deterministic behavior, packaging contracts, and adapter boundaries; it does not claim that external accounts accepted live requests.
