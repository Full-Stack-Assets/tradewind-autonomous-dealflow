# Tradewind Complete Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the verified Slice 1 deterministic DealFlow into a locally runnable, persistence-ready, source-aware, provider-ready operating system with resumable workflows, PostgreSQL/PostGIS migrations, Massachusetts and Rhode Island ingestion adapters, operator API/dashboard, evals, deployment packaging, and complete release evidence.

**Architecture:** Keep the pure TypeScript domain independent from infrastructure. Introduce a persistence port with an in-memory transactional implementation and a PostgreSQL implementation driven by a narrow SQL-client interface; state checkpoints and outbox events commit atomically. Real data and provider integrations remain adapter-based, with network-free fixtures and contract tests as the default verification path.

**Tech Stack:** Node.js >=22, TypeScript, native `node:test`, PostgreSQL 16 + PostGIS 3.4 schema, Fetch API, optional `pg`, `@openai/agents`, and Zod 4.

## Global Constraints

- Greenfield repository; do not import code from the legacy Tradewind repository.
- Massachusetts and Rhode Island are the only state-specific ingestion implementations in this roadmap.
- The default test/eval/smoke suite must run without network access, provider credentials, Docker, or PostgreSQL.
- Real source adapters retain source URL/item ID, retrieval time, source record ID, and raw payload.
- Missing source facts remain unknown; adapters may not invent mortgage, vacancy, distress, zoning, or ownership facts.
- Money values use integer cents and timestamps use UTC ISO-8601 strings.
- `packages/domain` may not import database, HTTP, GIS, OpenAI, ElevenLabs, UI, or provider SDK modules.
- Agents reason through typed tools; workflow/domain services own all mutations.
- Every network adapter supports timeouts, bounded retry, idempotency keys where applicable, and structured provider-call records.
- Behavioral production code follows red → green → refactor TDD.
- All generated fixtures and simulated transactions remain explicitly synthetic.

---

## File map

- `packages/domain/src/types.ts` — extend optional/unknown source facts, workflow checkpoints, exceptions, source records, documents, and signatures.
- `packages/persistence/src/contracts.ts` — transaction, workflow repository, outbox, and SQL client ports.
- `packages/persistence/src/in-memory-store.ts` — atomic in-memory persistence and lease semantics.
- `packages/persistence/src/postgres-store.ts` — PostgreSQL implementation over the SQL client port.
- `migrations/0001_core.sql` — PostgreSQL/PostGIS schema, indexes, constraints, outbox, and lease tables.
- `packages/workflows/src/resumable-deal-flow.ts` — resumable stage executor and checkpoint recovery.
- `packages/ingestion/src/http.ts` — timeout/retry Fetch transport.
- `packages/ingestion/src/arcgis.ts` — ArcGIS item resolution and paginated FeatureServer query client.
- `packages/ingestion/src/massgis.ts` — official MassGIS Level 3 parcel mapping and field normalization.
- `packages/ingestion/src/ri-directory.ts` — official RI.gov municipality source-directory parser and registry.
- `packages/ingestion/src/source-runner.ts` — cursor, deduplication, source health, and normalized ingestion runs.
- `packages/providers/src/resilience.ts` — retry, circuit breaker, and idempotency utilities.
- `packages/providers/src/http-adapters.ts` — canonical REST adapters for enrichment, signature, buyer outreach, and closing.
- `packages/voice/src/contracts.ts` — provider-neutral voice session contracts.
- `packages/voice/src/openai-realtime.ts` — OpenAI Realtime configuration/session boundary.
- `packages/voice/src/elevenlabs.ts` — ElevenLabs conversational-agent boundary.
- `packages/documents/src/render.ts` — deterministic document package rendering and hashing.
- `packages/telemetry/src/metrics.ts` — counters, durations, workflow/source health snapshots.
- `apps/api/src/server.ts` — HTTP API, health/readiness, workflow/source/event/metric endpoints, static operator shell.
- `apps/worker/src/runner.ts` — ingestion, workflow resume, and outbox worker loops.
- `evals/cases.ts` and `evals/run.ts` — deterministic behavior/evaluation matrix.
- `Dockerfile`, `compose.yaml`, `.env.example`, `.github/workflows/ci.yml` — reproducible packaging and CI.
- `docs/architecture/*`, `docs/runbooks/*`, `docs/release/*` — architecture, activation, operations, and evidence.

---

### Task 1: Durable persistence contracts, PostGIS schema, and atomic outbox

**Files:**
- Modify: `packages/domain/src/types.ts`
- Create: `packages/persistence/src/contracts.ts`
- Create: `packages/persistence/src/in-memory-store.ts`
- Create: `packages/persistence/src/postgres-store.ts`
- Create: `migrations/0001_core.sql`
- Test: `tests/persistence.test.ts`
- Test: `tests/postgres-schema.test.ts`

**Interfaces:**
- Produces: `WorkflowCheckpoint`, `WorkflowExceptionRecord`, `OutboxRecord`, `TransactionalDealFlowStore`, `InMemoryDealFlowStore`, `PostgresDealFlowStore`, `SqlClient`, `SqlTransaction`.
- Required methods: `transaction(fn)`, `saveCheckpoint(checkpoint)`, `loadCheckpoint(workflowId)`, `appendEvents(events)`, `enqueueOutbox(records)`, `claimRunnable(limit, leaseOwner, leaseSeconds)`, `markOutboxPublished(id, publishedAt)`.

- [ ] **Step 1: Write a failing atomicity test**

Create a test that begins an in-memory transaction, saves a checkpoint and event/outbox record, throws, and asserts all three collections remain empty. Add a successful transaction assertion that all three become visible together.

- [ ] **Step 2: Run the persistence test and verify RED**

Run: `node --experimental-strip-types --test tests/persistence.test.ts`

Expected: FAIL because persistence contracts and implementation do not exist.

- [ ] **Step 3: Implement minimum persistence contracts and in-memory transaction**

Implement snapshot-on-begin / replace-on-commit semantics, defensive copies, optimistic `version` checks, and lease fields `leaseOwner`/`leaseExpiresAt`.

- [ ] **Step 4: Verify persistence GREEN**

Run: `node --experimental-strip-types --test tests/persistence.test.ts`

- [ ] **Step 5: Write failing SQL schema contract test**

Assert `migrations/0001_core.sql` includes `CREATE EXTENSION IF NOT EXISTS postgis`, `workflow_runs`, `workflow_checkpoints`, `domain_events`, `provider_calls`, `outbox`, `source_snapshots`, `properties`, `buyers`, `completed_transactions`, a unique event ID, unique outbox dedupe key, JSONB payloads, geometry column with SRID 4326, and claim indexes.

- [ ] **Step 6: Verify schema test RED**

Run: `node --experimental-strip-types --test tests/postgres-schema.test.ts`

- [ ] **Step 7: Implement migration and PostgreSQL store**

Use parameterized SQL only. `PostgresDealFlowStore.transaction` must issue `BEGIN`, `COMMIT`, and `ROLLBACK`; checkpoint writes use `INSERT ... ON CONFLICT ... WHERE workflow_checkpoints.version = $expectedVersion`; outbox claims use `FOR UPDATE SKIP LOCKED`.

- [ ] **Step 8: Verify task suite and typecheck**

Run:

```bash
node --experimental-strip-types --test tests/persistence.test.ts tests/postgres-schema.test.ts
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/domain packages/persistence migrations tests/persistence.test.ts tests/postgres-schema.test.ts
git commit -m "feat: add durable persistence and transactional outbox"
```

---

### Task 2: Resumable workflow checkpoints, retries, and idempotent completion

**Files:**
- Create: `packages/workflows/src/resumable-deal-flow.ts`
- Modify: `packages/workflows/src/deal-flow-workflow.ts`
- Modify: `packages/events/src/event-store.ts`
- Test: `tests/workflow-resume.test.ts`
- Test: `tests/workflow-idempotency.test.ts`

**Interfaces:**
- Consumes: `TransactionalDealFlowStore`, provider contracts, `SourceRecord`, `Buyer[]`.
- Produces: `ResumableDealFlow.start(input)`, `ResumableDealFlow.resume(workflowId)`, `runNext(workflowId)`, `runToTerminal(workflowId)`, and terminal `CompletedTransaction`.

- [ ] **Step 1: Write failing resume test**

Use a seller provider that fails once. Assert the first run persists `EXCEPTION` at `SELLER_ENGAGED`, retains completed events/provider calls, then replacing the provider and calling `resume` continues without repeating `PropertyIngested`, `LeadQualified`, or `EnrichmentCompleted`.

- [ ] **Step 2: Verify RED**

Run: `node --experimental-strip-types --test tests/workflow-resume.test.ts`

- [ ] **Step 3: Implement one-stage-at-a-time executor**

Persist a versioned checkpoint containing state and structured context after every stage. Each stage writes aggregate changes, checkpoint, events, provider calls, and outbox rows in one store transaction.

- [ ] **Step 4: Verify resume GREEN**

Run: `node --experimental-strip-types --test tests/workflow-resume.test.ts`

- [ ] **Step 5: Write failing idempotency test**

Call `runToTerminal` twice for the same workflow and assert one completed transaction, one `DealArchived`, and no duplicate provider operations or event IDs.

- [ ] **Step 6: Implement terminal/idempotency handling and verify**

Run:

```bash
node --experimental-strip-types --test tests/workflow-resume.test.ts tests/workflow-idempotency.test.ts
npm test
npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/workflows packages/events tests/workflow-resume.test.ts tests/workflow-idempotency.test.ts
git commit -m "feat: make deal workflows durable and resumable"
```

---

### Task 3: Official Massachusetts and Rhode Island source adapters

**Files:**
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/domain/src/normalize.ts`
- Modify: `packages/domain/src/scoring.ts`
- Create: `packages/ingestion/src/http.ts`
- Create: `packages/ingestion/src/arcgis.ts`
- Create: `packages/ingestion/src/massgis.ts`
- Create: `packages/ingestion/src/ri-directory.ts`
- Create: `packages/ingestion/src/source-runner.ts`
- Create: `fixtures/massgis-feature-response.json`
- Create: `fixtures/ri-land-records-directory.html`
- Test: `tests/arcgis-ingestion.test.ts`
- Test: `tests/massgis-ingestion.test.ts`
- Test: `tests/ri-directory.test.ts`
- Test: `tests/source-runner.test.ts`

**Interfaces:**
- Produces: `HttpTransport`, `FetchHttpTransport`, `ArcGisItemResolver`, `ArcGisFeatureServiceClient`, `MassGisParcelProvider`, `RiMunicipalSourceDirectory`, `SourceIngestionRunner`, `SourceHealth`.
- Official defaults: MassGIS ArcGIS item ID `0f5a992fd9f24b2bb0cd9d4b4242d9f8`; RI directory URL `https://www.ri.gov/towns/landtaxdata/`.

- [ ] **Step 1: Write failing ArcGIS pagination/query test**

Use a fake transport returning item metadata then two feature pages. Assert URL encoding, `resultOffset`, `resultRecordCount`, `outFields`, `returnGeometry=false`, and stable source-record deduplication.

- [ ] **Step 2: Implement HTTP transport and ArcGIS client**

The transport uses `AbortSignal.timeout`, retries only 408/429/5xx and network failures, honors `Retry-After`, and caps attempts. The ArcGIS client resolves the item `url`, inspects layer metadata when needed, and paginates until `exceededTransferLimit` is false.

- [ ] **Step 3: Write failing MassGIS mapping test**

Map `LOC_ID`, `SITE_ADDR`, `CITY`, `ZIP`, `TOTAL_VAL`, `OWNER1`, `OWN_STATE`, `USE_CODE`, `ZONING`, `YEAR_BUILT`, `LS_PRICE`, and `LS_DATE`. Assert absent mortgage/vacancy/distress facts remain `undefined`, not zero/false, and that raw attributes plus ArcGIS object ID are retained.

- [ ] **Step 4: Implement MassGIS provider and unknown-aware scoring**

Award equity points only when a mortgage estimate is present. Keep the existing synthetic fixture score unchanged because it supplies that estimate.

- [ ] **Step 5: Write failing RI directory parser test**

Parse the fixture into all municipalities present in the official directory, preserving municipality name and distinct land-record/tax-assessment URLs; classify known host families (`vgsi`, `nereval`, `crc`, `uslandrecords`, `other`).

- [ ] **Step 6: Implement RI directory provider**

Do not crawl municipality sites automatically. Return a source registry that downstream configured municipal adapters can consume.

- [ ] **Step 7: Write and implement source-runner test**

Assert source cursor persistence, source snapshot hash dedupe, normalized records, health timestamps, consecutive-failure count, and recovery from failed to healthy state.

- [ ] **Step 8: Verify task suite**

Run:

```bash
node --experimental-strip-types --test tests/arcgis-ingestion.test.ts tests/massgis-ingestion.test.ts tests/ri-directory.test.ts tests/source-runner.test.ts tests/qualification.test.ts
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/domain packages/ingestion fixtures tests/arcgis-ingestion.test.ts tests/massgis-ingestion.test.ts tests/ri-directory.test.ts tests/source-runner.test.ts tests/qualification.test.ts
git commit -m "feat: add Massachusetts and Rhode Island source adapters"
```

---

### Task 4: Provider resilience and production-shaped live adapter boundaries

**Files:**
- Modify: `packages/providers/src/contracts.ts`
- Create: `packages/providers/src/resilience.ts`
- Create: `packages/providers/src/http-adapters.ts`
- Modify: `packages/ai/src/openai-seller-provider.ts`
- Create: `packages/voice/src/contracts.ts`
- Create: `packages/voice/src/openai-realtime.ts`
- Create: `packages/voice/src/elevenlabs.ts`
- Test: `tests/provider-resilience.test.ts`
- Test: `tests/http-provider-adapters.test.ts`
- Test: `tests/voice-provider-contracts.test.ts`

**Interfaces:**
- Produces: `RetryPolicy`, `CircuitBreaker`, `IdempotencyStore`, `CanonicalEnrichmentHttpProvider`, `CanonicalSignatureHttpProvider`, `CanonicalBuyerOutreachHttpProvider`, `CanonicalClosingHttpProvider`, `VoiceSessionProvider`, `OpenAIRealtimeVoiceProvider`, `ElevenLabsVoiceProvider`.

- [ ] **Step 1: Write failing retry/circuit-breaker tests**

Assert transient failures retry to success, permanent 4xx errors do not retry, the breaker opens after the configured threshold, half-open allows one probe, and duplicate idempotency keys return the original result.

- [ ] **Step 2: Implement resilience utilities and verify**

- [ ] **Step 3: Write failing canonical HTTP adapter tests**

Use a fake transport to assert secret redaction, authorization header injection, idempotency header, correlation ID, timeout, canonical response validation, and `ProviderFailure` mapping.

- [ ] **Step 4: Implement canonical live adapters**

Adapters must reject missing endpoint/key configuration before network access and never write secrets into `ProviderCall` or error payloads.

- [ ] **Step 5: Write failing voice-boundary tests**

Assert OpenAI uses model default `gpt-realtime` and constructs a session request without exposing the API key; ElevenLabs requires agent ID and API key, creates a signed/conversation session request, and maps status to the provider-neutral contract.

- [ ] **Step 6: Implement voice providers and update seller-model default**

Use `gpt-5.6-terra` as the balanced default seller reasoning model, with `gpt-5.6` remaining configurable for maximum capability.

- [ ] **Step 7: Verify and commit**

```bash
node --experimental-strip-types --test tests/provider-resilience.test.ts tests/http-provider-adapters.test.ts tests/voice-provider-contracts.test.ts tests/openai-provider-contract.test.ts
npm run typecheck
git add packages/providers packages/ai packages/voice tests/provider-resilience.test.ts tests/http-provider-adapters.test.ts tests/voice-provider-contracts.test.ts tests/openai-provider-contract.test.ts
git commit -m "feat: add resilient live provider boundaries"
```

---

### Task 5: Deterministic documents, signature envelopes, and artifact integrity

**Files:**
- Modify: `packages/domain/src/types.ts`
- Create: `packages/documents/src/canonical.ts`
- Create: `packages/documents/src/render.ts`
- Create: `packages/documents/templates/acquisition-v1.txt`
- Create: `packages/documents/templates/assignment-v1.txt`
- Test: `tests/documents.test.ts`

**Interfaces:**
- Produces: `DocumentTemplate`, `DocumentArtifact`, `SignatureEnvelope`, `canonicalJson(value)`, `renderDocument(template, inputs)`, `verifyArtifact(artifact)`.

- [ ] **Step 1: Write failing deterministic-render test**

Assert key-order-independent canonical inputs produce identical UTF-8 bytes and SHA-256 hash, template/input changes alter the hash, money formatting is deterministic, and every placeholder must be supplied.

- [ ] **Step 2: Implement canonical rendering and integrity verification**

Rendered artifacts contain template ID/version, subject ID/type, canonical input hash, content hash, MIME type, byte length, and created timestamp.

- [ ] **Step 3: Write failing signature-envelope test**

Assert an envelope binds to the exact artifact content hash and cannot be applied to a modified artifact.

- [ ] **Step 4: Implement, verify, and commit**

```bash
node --experimental-strip-types --test tests/documents.test.ts
npm run typecheck
git add packages/domain packages/documents tests/documents.test.ts
git commit -m "feat: add deterministic document artifacts"
```

---

### Task 6: Operator API, dashboard, worker loops, and telemetry

**Files:**
- Create: `packages/telemetry/src/metrics.ts`
- Create: `apps/api/src/operator-html.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/worker/src/runner.ts`
- Modify: `package.json`
- Modify: `types/node-shim.d.ts`
- Test: `tests/api.test.ts`
- Test: `tests/worker.test.ts`
- Test: `tests/telemetry.test.ts`

**Interfaces:**
- Produces: `MetricsRegistry`, `createApiServer(dependencies)`, `WorkerRunner.tick()`, `WorkerRunner.drainOutbox()`.
- Routes: `GET /health`, `GET /ready`, `GET /`, `GET /v1/workflows`, `GET /v1/workflows/:id`, `GET /v1/events`, `GET /v1/sources`, `GET /v1/metrics`, `POST /v1/simulations`.

- [ ] **Step 1: Write failing telemetry test**

Assert counters, duration observations, source-health gauges, and immutable snapshot output.

- [ ] **Step 2: Implement telemetry registry**

- [ ] **Step 3: Write failing API test**

Start the API on an ephemeral port. Assert JSON content types, no-store headers, health/readiness behavior, validation errors, simulation creation, workflow readback, and operator HTML containing lifecycle/source/exception sections.

- [ ] **Step 4: Implement dependency-injected native Node HTTP API**

Use no framework. Enforce request size limit, method routing, JSON parsing, optional `TRADEWIND_API_TOKEN` bearer authentication for `/v1/*`, and structured error responses.

- [ ] **Step 5: Write failing worker test**

Assert one tick claims only unleased work, resumes workflows, publishes outbox records exactly once, releases/expirs leases, and increments telemetry.

- [ ] **Step 6: Implement worker, verify, and commit**

```bash
node --experimental-strip-types --test tests/telemetry.test.ts tests/api.test.ts tests/worker.test.ts
npm test
npm run typecheck
git add packages/telemetry apps/api apps/worker package.json types tests/telemetry.test.ts tests/api.test.ts tests/worker.test.ts
git commit -m "feat: add operator API worker and telemetry"
```

---

### Task 7: Evaluation harness and complete autonomous acceptance suite

**Files:**
- Create: `evals/cases.ts`
- Create: `evals/run.ts`
- Create: `evals/results/.gitignore`
- Modify: `package.json`
- Test: `tests/evals.test.ts`
- Create: `tests/full-system.acceptance.test.ts`

**Interfaces:**
- Produces: `runEvaluations()` and JSON result artifact at `evals/results/latest.json`.

- [ ] **Step 1: Write failing eval-harness test**

The matrix must include: happy path, unqualified lead, missing mortgage fact, enrichment transient failure/retry, seller exception/resume, no eligible buyer, duplicate run/idempotency, document tamper detection, source duplicate suppression, and outbox exactly-once publication.

- [ ] **Step 2: Implement eval runner**

Each case returns `passed`, observed terminal state, event sequence, provider operations, invariant failures, and duration. Exit non-zero when any case fails.

- [ ] **Step 3: Write full-system acceptance test**

Execute a synthetic MA ingestion record through source runner, persistent resumable workflow, documents, assignment, closing, outbox, API readback, and completed-transaction archival.

- [ ] **Step 4: Verify and commit**

```bash
npm run eval
node --experimental-strip-types --test tests/evals.test.ts tests/full-system.acceptance.test.ts
npm test
npm run typecheck
git add evals package.json tests/evals.test.ts tests/full-system.acceptance.test.ts
git commit -m "test: add autonomous system evaluation matrix"
```

---

### Task 8: Deployment, CI, runbooks, release evidence, and distributable artifacts

**Files:**
- Create: `Dockerfile`
- Create: `compose.yaml`
- Create: `.dockerignore`
- Create: `.env.example`
- Create: `.github/workflows/ci.yml`
- Create: `scripts/migrate.ts`
- Create: `scripts/verify-release.ts`
- Create: `docs/architecture/SYSTEM.md`
- Create: `docs/architecture/DATA_SOURCES.md`
- Create: `docs/runbooks/LOCAL_POSTGRES.md`
- Create: `docs/runbooks/PROVIDER_ACTIVATION.md`
- Create: `docs/runbooks/BACKUP_RECOVERY.md`
- Create: `docs/release/RELEASE_CHECKLIST.md`
- Create: `docs/release/VERIFICATION_REPORT.md`
- Modify: `README.md`
- Modify: `package.json`
- Test: `tests/release-packaging.test.ts`

**Interfaces:**
- Produces commands: `npm run api`, `npm run worker`, `npm run migrate`, `npm run eval`, `npm run verify:release`.

- [ ] **Step 1: Write failing packaging test**

Assert Node 22 image, non-root runtime user, healthcheck, PostGIS 16 service, persistent volume, migration command, no secret defaults, CI test/typecheck/eval/release jobs, and complete runbook/checklist files.

- [ ] **Step 2: Implement packaging and runbooks**

The provider activation runbook lists required environment-variable names only and distinguishes implemented adapter verification from unexecuted live-account verification.

- [ ] **Step 3: Implement release verifier**

Run tests, typecheck, evals, smoke, domain import-boundary scan, migration/schema scan, forbidden-secret scan, `git diff --check`, and produce a JSON + Markdown evidence summary using actual command results.

- [ ] **Step 4: Run complete verification**

```bash
npm run verify:release
git status --short
git diff --check
```

Expected: all local gates pass and the working tree contains only the generated verification report update intended for the final evidence commit.

- [ ] **Step 5: Commit release evidence**

```bash
git add Dockerfile compose.yaml .dockerignore .env.example .github scripts docs README.md package.json tests/release-packaging.test.ts evals/results/latest.json
git commit -m "chore: package and verify complete greenfield release"
```

- [ ] **Step 6: Produce artifacts**

Create a source ZIP excluding `.git`, `node_modules`, `.worktrees`, secrets, and generated transient logs; create a full Git bundle; compute SHA-256 checksums; upload both to Google Drive; and report any unavailable external verification (live PostgreSQL, OpenAI, ElevenLabs, enrichment, e-sign, closing accounts) without converting it into a local build failure.
