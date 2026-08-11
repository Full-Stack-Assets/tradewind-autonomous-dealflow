# Tradewind Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic, executable end-to-end wholesale DealFlow vertical slice from a property fixture through archived completed transaction, with provider simulators and a compile-ready OpenAI seller-agent adapter.

**Architecture:** A TypeScript modular monolith separates pure domain logic, append-only events, provider interfaces, deterministic simulators, matching, and durable workflow orchestration. The workflow owns state transitions; provider adapters return structured results and never mutate workflow state directly. The default path is offline and deterministic, while the live OpenAI adapter is opt-in.

**Tech Stack:** Node.js >=22, TypeScript, npm workspaces, Vitest, Zod v4, `@openai/agents` for the optional live seller-agent adapter.

## Global Constraints

- Greenfield repository; do not import code from the legacy Tradewind repository.
- Massachusetts/Rhode Island first, but Slice 1 fixture data is synthetic and explicitly labeled as such.
- Legal/financial approval gating is outside the current build critical path.
- Money values use integer cents.
- Dates use UTC ISO-8601 strings.
- The default test suite must not require network access or credentials.
- `packages/domain` must not depend on OpenAI, ElevenLabs, database, HTTP, GIS, or UI libraries.
- Behavioral code follows red → green → refactor TDD.

---

## File map

- `package.json` — root scripts and dependencies.
- `tsconfig.json` — shared TypeScript configuration.
- `vitest.config.ts` — deterministic test configuration.
- `packages/domain/src/types.ts` — core aggregate/value types.
- `packages/domain/src/clock.ts` — clock and ID source interfaces plus deterministic test implementation.
- `packages/domain/src/normalize.ts` — source fixture normalization.
- `packages/domain/src/scoring.ts` — deterministic lead score.
- `packages/events/src/event-store.ts` — append-only event collector.
- `packages/providers/src/contracts.ts` — provider interfaces and result contracts.
- `packages/providers/src/simulators.ts` — deterministic enrichment, seller, signature, buyer outreach, and closing simulators.
- `packages/matching/src/match-buyers.ts` — deterministic buy-box filter and ranker.
- `packages/workflows/src/deal-flow-workflow.ts` — full lifecycle orchestration and state transitions.
- `packages/ai/src/openai-seller-provider.ts` — opt-in OpenAI Agents SDK seller provider.
- `fixtures/synthetic-property.ts` — explicitly synthetic property/buyer fixture.
- `apps/worker/src/smoke.ts` — CLI smoke entrypoint.
- `tests/*.test.ts` — unit, contract, and acceptance tests.

---

### Task 1: Repository toolchain and domain contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `packages/domain/src/types.ts`
- Create: `packages/domain/src/clock.ts`
- Test: `tests/domain-contracts.test.ts`

**Interfaces:**
- Produces: `MoneyCents`, `SourceRecord`, `Property`, `LeadScore`, `OwnerIdentity`, `ContactPoint`, `NegotiatedDeal`, `Buyer`, `BuyerBuyBox`, `Assignment`, `Closing`, `FeeEvent`, `CompletedTransaction`, `WorkflowState`, `IdSource`, `Clock`, `DeterministicRuntime`.

- [ ] **Step 1: Create root toolchain configuration and install dependencies**

Create npm scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "smoke": "tsx apps/worker/src/smoke.ts"
  }
}
```

Install `typescript`, `tsx`, `vitest`, `zod`, and `@openai/agents`.

- [ ] **Step 2: Write failing domain-contract test**

```ts
import { describe, expect, it } from 'vitest';
import { DeterministicRuntime } from '../packages/domain/src/clock';

it('produces stable ids and timestamps', () => {
  const runtime = new DeterministicRuntime('2026-08-11T16:00:00.000Z');
  expect(runtime.nextId('property')).toBe('property-0001');
  expect(runtime.now()).toBe('2026-08-11T16:00:00.000Z');
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm test -- tests/domain-contracts.test.ts`

Expected: FAIL because `packages/domain/src/clock.ts` does not exist.

- [ ] **Step 4: Implement minimal domain contracts and deterministic runtime**

Implement the listed interfaces/types and `DeterministicRuntime` with prefix counters and a fixed clock.

- [ ] **Step 5: Verify GREEN and typecheck**

Run:

```bash
npm test -- tests/domain-contracts.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts packages/domain tests/domain-contracts.test.ts
git commit -m "feat: add slice one domain contracts"
```

---

### Task 2: Property normalization and deterministic scoring

**Files:**
- Create: `packages/domain/src/normalize.ts`
- Create: `packages/domain/src/scoring.ts`
- Create: `fixtures/synthetic-property.ts`
- Test: `tests/qualification.test.ts`

**Interfaces:**
- Consumes: `SourceRecord`, `Property`, `LeadScore`, `IdSource`, `Clock`.
- Produces: `normalizeProperty(source, runtime): Property`; `scoreLead(property): LeadScore`.

- [ ] **Step 1: Write failing normalization/scoring tests**

Test that the synthetic fixture normalizes to `MA`, retains source lineage, stores integer-cent assessed value, and yields the expected deterministic score/qualification flag.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- tests/qualification.test.ts`

Expected: FAIL because normalization/scoring functions are missing.

- [ ] **Step 3: Implement minimum normalization and score formula**

Use explicit weighted components in integer points: equity proxy, absentee-owner indicator, vacancy/distress indicator, and target-state fit. Return component breakdown plus total 0–100 and `qualified = total >= 60`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/qualification.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/normalize.ts packages/domain/src/scoring.ts fixtures/synthetic-property.ts tests/qualification.test.ts
git commit -m "feat: normalize and score synthetic leads"
```

---

### Task 3: Append-only events and provider simulator contracts

**Files:**
- Create: `packages/events/src/event-store.ts`
- Create: `packages/providers/src/contracts.ts`
- Create: `packages/providers/src/simulators.ts`
- Test: `tests/providers.test.ts`
- Test: `tests/events.test.ts`

**Interfaces:**
- Produces: `DomainEvent`, `InMemoryEventStore.append(event)`, `InMemoryEventStore.all()`, `EnrichmentProvider`, `SellerConversationProvider`, `SignatureProvider`, `BuyerOutreachProvider`, `ClosingProvider`, and deterministic simulator implementations.

- [ ] **Step 1: Write failing event-store test**

Assert append order is preserved and `all()` returns a copy rather than the internal array.

- [ ] **Step 2: Verify event test RED**

Run: `npm test -- tests/events.test.ts`

- [ ] **Step 3: Implement minimal append-only event store**

No update/delete methods.

- [ ] **Step 4: Verify event test GREEN**

Run: `npm test -- tests/events.test.ts`

- [ ] **Step 5: Write failing provider contract tests**

Assert deterministic simulators return structured enrichment, accepted seller terms, executed signature, interested buyer selection input, and confirmed closing using the fixed runtime.

- [ ] **Step 6: Verify provider tests RED**

Run: `npm test -- tests/providers.test.ts`

- [ ] **Step 7: Implement simulator providers**

Simulators must consume inputs and runtime, return deterministic IDs/statuses, and never mutate workflow state.

- [ ] **Step 8: Verify provider tests GREEN**

Run: `npm test -- tests/providers.test.ts`

- [ ] **Step 9: Commit**

```bash
git add packages/events packages/providers tests/events.test.ts tests/providers.test.ts
git commit -m "feat: add events and deterministic providers"
```

---

### Task 4: Deterministic buyer matching

**Files:**
- Create: `packages/matching/src/match-buyers.ts`
- Extend: `fixtures/synthetic-property.ts`
- Test: `tests/matching.test.ts`

**Interfaces:**
- Produces: `matchBuyers(property, negotiatedDeal, buyers): Match[]`.

- [ ] **Step 1: Write failing match tests**

Use three synthetic buyers: one exact-fit, one price-incompatible, one wrong-state. Assert only compatible buyers survive and results are sorted by descending fit score with deterministic tie breaking by buyer ID.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/matching.test.ts`

- [ ] **Step 3: Implement deterministic filter and ranker**

Eligibility must require state, property type, maximum purchase cents, and supported strategy. Ranking may add evidence and closing-speed points only after eligibility passes.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/matching.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/matching fixtures/synthetic-property.ts tests/matching.test.ts
git commit -m "feat: add deterministic buyer matching"
```

---

### Task 5: End-to-end durable workflow slice

**Files:**
- Create: `packages/workflows/src/deal-flow-workflow.ts`
- Test: `tests/deal-flow.acceptance.test.ts`
- Test: `tests/workflow-exception.test.ts`

**Interfaces:**
- Consumes: normalization, scoring, event store, provider interfaces, matching, runtime, synthetic fixtures.
- Produces: `DealFlowWorkflow.run(sourceRecord, buyers): Promise<CompletedTransaction>` and `DealFlowWorkflow.getState(): WorkflowState`.

- [ ] **Step 1: Write failing happy-path acceptance test**

Assert one run returns `ARCHIVED`, emits exactly the 14 canonical happy-path event types in order, selects only the compatible buyer, records assignment/closing/fee, and archives all reference IDs.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/deal-flow.acceptance.test.ts`

- [ ] **Step 3: Implement minimum workflow transitions**

Implement explicit transition methods. After each successful stage, update state and append one canonical event. Compute assignment fee as `assignmentPriceCents - acquisitionPriceCents` and require it to be non-negative.

- [ ] **Step 4: Verify happy path GREEN**

Run: `npm test -- tests/deal-flow.acceptance.test.ts`

- [ ] **Step 5: Write failing exception test**

Use a seller provider that throws a typed `ProviderFailure`; assert workflow state becomes `EXCEPTION`, reason is recorded, and no downstream events occur.

- [ ] **Step 6: Verify exception test RED**

Run: `npm test -- tests/workflow-exception.test.ts`

- [ ] **Step 7: Implement explicit exception handling**

Catch provider failures at stage boundaries, set `EXCEPTION`, retain resumable workflow ID and reason, and rethrow a `WorkflowException` containing stage/cause metadata.

- [ ] **Step 8: Verify GREEN and full suite**

Run:

```bash
npm test
npm run typecheck
```

- [ ] **Step 9: Commit**

```bash
git add packages/workflows tests/deal-flow.acceptance.test.ts tests/workflow-exception.test.ts
git commit -m "feat: orchestrate slice one deal lifecycle"
```

---

### Task 6: OpenAI seller-provider boundary and CLI smoke

**Files:**
- Create: `packages/ai/src/openai-seller-provider.ts`
- Create: `apps/worker/src/smoke.ts`
- Test: `tests/openai-provider-contract.test.ts`
- Test: `tests/smoke.test.ts`
- Create: `README.md`

**Interfaces:**
- Produces: `OpenAISellerConversationProvider implements SellerConversationProvider`; CLI smoke command `npm run smoke`.

- [ ] **Step 1: Write failing OpenAI adapter contract test without network**

Test constructor/config validation only: missing `OPENAI_API_KEY` when the live provider is explicitly instantiated must throw a clear configuration error before a network call.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/openai-provider-contract.test.ts`

- [ ] **Step 3: Implement compile-ready Agents SDK adapter**

Use `Agent`, `tool`, and Zod schemas. Agent output must be structured seller-conversation output. Tool functions operate on a supplied context/service interface; they do not access a database directly.

- [ ] **Step 4: Verify contract test GREEN**

Run: `npm test -- tests/openai-provider-contract.test.ts`

- [ ] **Step 5: Write failing CLI smoke test**

Assert the smoke helper returns an archived transaction summary containing workflow ID, property ID, buyer ID, assignment fee cents, closing status, and event count.

- [ ] **Step 6: Verify RED**

Run: `npm test -- tests/smoke.test.ts`

- [ ] **Step 7: Implement CLI smoke and README**

`npm run smoke` must run only deterministic simulators and print JSON. Document `npm install`, `npm test`, `npm run typecheck`, `npm run smoke`, and optional live OpenAI configuration using the environment variable name only.

- [ ] **Step 8: Verify GREEN**

Run:

```bash
npm test
npm run typecheck
npm run smoke
```

Expected: all tests pass and smoke prints one archived transaction summary.

- [ ] **Step 9: Structural dependency check**

Run:

```bash
rg -n "@openai|elevenlabs|postgres|drizzle|prisma|express|fastify" packages/domain || true
```

Expected: no matches.

- [ ] **Step 10: Commit**

```bash
git add packages/ai apps/worker README.md tests/openai-provider-contract.test.ts tests/smoke.test.ts
git commit -m "feat: add OpenAI boundary and slice one smoke runner"
```

---

## Final verification

Run:

```bash
npm test
npm run typecheck
npm run smoke
git status --short
git log --oneline --decorate -8
```

Expected:

- all tests pass;
- TypeScript reports no errors;
- smoke output is an archived completed transaction;
- worktree is clean;
- design and plan are present in git history.
