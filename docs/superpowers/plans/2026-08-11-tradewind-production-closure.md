# Tradewind Production Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every locally implementable production gap remaining after the complete-roadmap release by making source state durable, scheduling source-to-workflow intake, completing outbound voice/transcript boundaries, refreshing official source/model contracts, and producing a final verified release bundle.

**Architecture:** Preserve the modular-monolith design and pure domain boundary. Source state is persisted through its own narrow SQL-backed port; worker scheduling remains dependency-injected and opt-in; voice calls and transcript interpretation remain provider adapters that cannot mutate workflow state directly. Live network/account checks remain explicit external verification gates rather than simulated claims.

**Tech Stack:** Node.js 22+, TypeScript, native `node:test`, PostgreSQL 16/PostGIS 3.4, Fetch API, optional `pg`, `@openai/agents`, Zod 4.

## Global Constraints

- Default tests, evals, and smoke commands remain credential-free and network-free.
- No live seller call, signature, buyer outreach, closing action, or money movement is initiated by the test/release path.
- Every external result is typed and validated before advancing workflow state.
- PostgreSQL source cursor, snapshot, and health operations use parameterized SQL and preserve immutable raw payloads.
- Source scheduling is explicit, bounded, and disabled unless a source job is configured.
- The worker never invents a buyer catalogue for live records.
- Current source/provider identifiers are documented with retrieval date and can be overridden without changing domain code.
- Production behavior follows red → green → refactor TDD.

---

### Task 1: Durable PostgreSQL source state

**Files:**
- Modify: `migrations/0001_core.sql`
- Create: `packages/ingestion/src/postgres-source-store.ts`
- Test: `tests/postgres-source-state.test.ts`
- Modify: `tests/postgres-schema.test.ts`

**Produces:** `PostgresSourceStateStore implements SourceStateStore` and durable `source_cursors` / `source_health` records.

- [ ] Write failing schema and adapter tests for cursor upsert, snapshot dedupe/save/list, health upsert/load, parameterization, connection release, and geometry-safe snapshot persistence.
- [ ] Run focused tests and verify expected failures.
- [ ] Add source cursor/health tables and the SQL-backed adapter.
- [ ] Run focused tests, full tests, and typecheck.
- [ ] Commit the durable source-state slice.

### Task 2: Scheduled autonomous source intake

**Files:**
- Modify: `apps/worker/src/runner.ts`
- Modify: `packages/runtime/src/application.ts`
- Modify: `apps/worker/src/main.ts`
- Test: `tests/worker-source-jobs.test.ts`
- Test: `tests/application-source-runtime.test.ts`

**Produces:** `ScheduledSourceJob`, due-time tracking, bounded per-tick source execution, and application wiring that selects memory/PostgreSQL source state consistently with workflow persistence.

- [ ] Write failing tests proving due jobs execute once, not-due jobs are skipped, failures are isolated/recorded, and accepted source records start workflows without duplicate snapshots.
- [ ] Implement the minimum scheduler and context wiring.
- [ ] Keep the default runtime source-job list empty; require explicit provider and buyer-catalogue injection for live intake.
- [ ] Run focused tests, full tests, and typecheck.
- [ ] Commit the autonomous source-intake slice.

### Task 3: Current official-source contracts and parcel geometry

**Files:**
- Modify: `packages/ingestion/src/arcgis.ts`
- Modify: `packages/ingestion/src/massgis.ts`
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/domain/src/normalize.ts`
- Test: `tests/arcgis-ingestion.test.ts`
- Modify: `tests/massgis-ingestion.test.ts`

**Produces:** configurable geometry retrieval, current MassGIS item/service defaults, and preserved source geometry without invented derived facts.

- [ ] Write failing tests for `returnGeometry=true`, output SRID 4326, current official item/service identity, geometry mapping, and safe cursor filtering.
- [ ] Implement the ArcGIS query options and MassGIS defaults/mapping.
- [ ] Run focused tests, full tests, and typecheck.
- [ ] Commit the source-contract refresh.

### Task 4: Outbound voice and transcript interpretation boundaries

**Files:**
- Modify: `packages/voice/src/contracts.ts`
- Modify: `packages/voice/src/elevenlabs.ts`
- Create: `packages/ai/src/openai-transcript-interpreter.ts`
- Test: `tests/elevenlabs-outbound.test.ts`
- Test: `tests/openai-transcript-interpreter.test.ts`

**Produces:** validated outbound-call initiation, conversation retrieval/transcript normalization, and structured OpenAI transcript interpretation with no direct workflow mutation.

- [ ] Write failing contract tests for configuration, E.164 phone validation, dynamic variables, correlation/idempotency metadata, conversation retrieval, transcript normalization, and malformed responses.
- [ ] Write failing transcript-interpreter tests for bounded context, credential checks, output validation, economic invariants, and secret exclusion.
- [ ] Implement minimum provider/interpreter behavior behind injected transports/runners.
- [ ] Run focused tests, full tests, and typecheck.
- [ ] Commit the completed voice/interpretation boundary.

### Task 5: Operations, release evidence, and artifacts

**Files:**
- Modify: `README.md`
- Modify: `.env.example`
- Modify: `docs/architecture/SYSTEM.md`
- Modify: `docs/architecture/DATA_SOURCES.md`
- Modify: `docs/runbooks/PROVIDER_ACTIVATION.md`
- Modify: `docs/release/RELEASE_CHECKLIST.md`
- Modify: `scripts/verify-release.ts`
- Modify: `tests/release-packaging.test.ts`
- Create: `docs/release/COMPLETENESS_AUDIT.md`

**Produces:** accurate operational documentation, current external-boundary matrix, final verification reports, source ZIP, Git bundle, and checksums.

- [ ] Write failing packaging/documentation assertions for durable source tables, source scheduler, current model/source identifiers, voice boundary, and locally completed checklist items.
- [ ] Update runbooks and architecture; keep account/network/Docker/PostgreSQL execution gates explicitly unverified when unavailable.
- [ ] Run `npm test`, `npm run typecheck`, `npm run eval`, `npm run smoke`, `npm run migrate -- --check`, and `npm run verify:release` on the exact candidate tree.
- [ ] Commit generated evidence separately from the implementation commit.
- [ ] Create a source ZIP and full Git bundle, compute SHA-256, upload both to Google Drive, and report GitHub repository-creation as an external platform boundary if the destination repository still does not exist.
