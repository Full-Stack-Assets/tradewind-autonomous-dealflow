# Tradewind Autonomous DealFlow — Greenfield Design Specification

**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Scope:** Greenfield autonomous real-estate wholesaling operating system, Massachusetts and Rhode Island first  
**Primary source brief:** `Automated Real Estate Pipeline.txt` supplied in the project conversation

## 1. Product objective

Build a technically complete, autonomy-first real-estate wholesale lifecycle system that can move a property opportunity from source ingestion through enrichment, seller acquisition, structured negotiation, document/signature orchestration, buyer matching, assignment, closing telemetry, fee recording, and archival with minimal human intervention.

The current engineering phase does not make legal or financial approval gating part of the implementation critical path. Real-world providers that are unavailable or intentionally not activated are represented by production-shaped interfaces plus deterministic simulators so the workflow remains executable end to end.

## 2. Design principles

1. **Durable workflow owns state.** AI reasoning never substitutes for workflow state, event history, retry state, or recovery state.
2. **Agents reason; tools mutate.** Agents have typed tools. They do not receive direct database access.
3. **Provider neutrality.** GIS, enrichment, voice, signature, settlement, and messaging integrations sit behind stable interfaces.
4. **Structured facts over transcript inference.** Seller facts, negotiated terms, buyer offers, signatures, closings, and fees are explicit domain objects.
5. **Append-only lifecycle events.** Material state changes emit domain events used for recovery, telemetry, audit, and downstream learning.
6. **Deterministic core.** Qualification, matching filters, workflow transitions, and simulator behavior are reproducible from inputs.
7. **Operational learning is automatic; model replacement is versioned.** Completed-deal telemetry may generate features and recommendations automatically, but production models/prompts remain explicit versions.
8. **Vertical slices before broad integration.** Each phase must produce runnable software rather than disconnected adapters.

## 3. Architecture

Use a TypeScript monorepo on Node.js 22 or newer.

The initial system is a modular monolith with isolated packages and one durable workflow runtime. It is intentionally not decomposed into network microservices until throughput or ownership boundaries justify that cost.

### 3.1 Layers

#### Acquisition Intelligence

- ingest MA/RI parcel and property source snapshots;
- normalize source records to canonical property/parcel records;
- retain original payload and source metadata;
- calculate deterministic lead features and qualification score;
- emit `PropertyIngested` and `LeadQualified` events.

#### Identity & Enrichment

- resolve owner identity and entity relationships;
- append mailing address, phones, emails, and optional debt/mortgage signals;
- reconcile multiple providers into one canonical result;
- emit `EnrichmentCompleted`.

#### Autonomous Seller Acquisition

- allocate qualified leads to an outreach strategy;
- support `VoiceProvider` implementations for simulator, ElevenLabs, and OpenAI Realtime;
- permit the seller agent to retrieve facts, record seller facts, calculate offer ranges, capture objections, schedule follow-up, and request document generation through typed tools;
- emit `OutreachStarted`, `SellerQualified`, `OfferGenerated`, and `TermsAccepted`.

#### Deal & Contract Engine

- materialize accepted terms as `NegotiatedDeal`;
- generate documents reproducibly from a template version plus structured inputs;
- use `SignatureProvider` behind a stable interface;
- emit `AcquisitionExecuted` when the acquisition package reaches executed state.

#### Buyer Matching & Assignment

- first apply deterministic buy-box compatibility filtering;
- then rank surviving candidates by property fit and buyer evidence;
- permit AI explanation or secondary ranking without bypassing deterministic eligibility;
- orchestrate buyer response, offer, assignment, and deposit state;
- emit `BuyersMatched`, `BuyerSelected`, and `AssignmentExecuted`.

#### Closing, Revenue & Learning

- track closing milestones independently from acquisition/disposition agents;
- materialize `Closing` and `FeeEvent` records;
- archive a completed transaction with full lifecycle telemetry;
- emit `ClosingConfirmed`, `FeeRecorded`, and `DealArchived`.

## 4. Domain model

Slice 1 must implement the minimum durable subset of these approved aggregates:

- `Property`
- `ParcelSnapshot`
- `OwnerIdentity`
- `ContactPoint`
- `Lead`
- `LeadScore`
- `EnrichmentRun`
- `Conversation`
- `SellerFact`
- `Offer`
- `NegotiatedDeal`
- `Buyer`
- `BuyerBuyBox`
- `BuyerEvidence`
- `Match`
- `Assignment`
- `Closing`
- `FeeEvent`
- `WorkflowRun`
- `ProviderCall`
- `DomainEvent`
- `CompletedTransaction`

Every persisted aggregate includes a stable ID, schema version, creation/update timestamps, and source lineage where applicable.

Money values are represented as integer cents. Dates/times are ISO-8601 strings in UTC.

## 5. Event model

The canonical happy-path event sequence is:

`PropertyIngested → LeadQualified → EnrichmentCompleted → OutreachStarted → SellerQualified → OfferGenerated → TermsAccepted → AcquisitionExecuted → BuyersMatched → BuyerSelected → AssignmentExecuted → ClosingConfirmed → FeeRecorded → DealArchived`

Each event includes:

- `eventId`
- `workflowId`
- `eventType`
- `aggregateType`
- `aggregateId`
- `occurredAt`
- `schemaVersion`
- `payload`

Events are append-only in Slice 1. Later persistent storage must support an outbox pattern so domain state and event publication cannot diverge.

## 6. Workflow model

`DealFlowWorkflow` owns orchestration. Its state is one of:

- `INGESTED`
- `QUALIFIED`
- `ENRICHED`
- `SELLER_ENGAGED`
- `TERMS_ACCEPTED`
- `ACQUISITION_EXECUTED`
- `BUYERS_MATCHED`
- `BUYER_SELECTED`
- `ASSIGNMENT_EXECUTED`
- `CLOSED`
- `ARCHIVED`
- `EXCEPTION`

Transient provider failures use bounded retry. Unresolved failures transition to `EXCEPTION` with a structured reason and remain resumable.

Workflow code calls domain services and providers. Providers never move workflow state directly.

## 7. Provider interfaces

Slice 1 defines stable interfaces and deterministic simulators for:

- `PropertySourceProvider`
- `EnrichmentProvider`
- `SellerConversationProvider`
- `SignatureProvider`
- `BuyerOutreachProvider`
- `ClosingProvider`

Each provider call records a `ProviderCall` with provider name, operation, status, start/end timestamps, and correlation ID. Secrets and raw credentials are never stored in these records.

## 8. AI topology

The approved future agent set is:

- Acquisition Analyst
- Seller Agent
- Disposition Agent
- Transaction Agent
- Optimization Agent

Slice 1 implements the AI boundary and the Seller Agent integration contract but uses a deterministic seller-conversation simulator for the end-to-end acceptance path.

The live OpenAI implementation uses the current `@openai/agents` TypeScript SDK with Zod v4 schemas, function tools, structured output, and built-in tracing. The SDK runs behind `SellerConversationProvider`, keeping the domain and workflow packages free of OpenAI dependencies.

## 9. Package boundaries

```text
tradewind-autonomous-dealflow/
├── apps/
│   ├── api/
│   └── worker/
├── packages/
│   ├── domain/
│   ├── events/
│   ├── workflows/
│   ├── ingestion/
│   ├── enrichment/
│   ├── seller-agent/
│   ├── buyers/
│   ├── matching/
│   ├── closing/
│   ├── providers/
│   ├── ai/
│   └── telemetry/
├── fixtures/
├── evals/
├── docs/
└── tests/
```

`packages/domain` may not import OpenAI, ElevenLabs, GIS SDKs, database clients, HTTP frameworks, or UI packages.

## 10. Slice 1 acceptance path

Slice 1 must execute this complete workflow from one command:

`fixture source → normalize property → score lead → enrichment simulator → seller conversation simulator → negotiated deal → simulated acquisition signature → deterministic buyer match → simulated buyer selection/assignment → simulated closing → fee record → archived completed transaction`

Acceptance requirements:

1. identical input fixture produces identical material outputs apart from generated IDs/timestamps supplied by a deterministic test clock/ID source;
2. every successful transition emits the expected ordered event;
3. no buyer outside the deterministic buy box can be selected;
4. provider failures are represented explicitly and can move the workflow to `EXCEPTION`;
5. a completed transaction contains property, seller, acquisition, buyer, assignment, closing, fee, event, and provider-call references;
6. the system can run entirely without external provider credentials;
7. a live OpenAI seller-agent smoke path is separately available when `OPENAI_API_KEY` exists.

## 11. Testing strategy

Use strict TDD for behavioral code.

- unit tests for normalization, scoring, event append behavior, matching, money arithmetic, and workflow transition rules;
- contract tests for each provider simulator;
- an end-to-end acceptance test for the full Slice 1 lifecycle;
- deterministic fixtures only; never invent external facts and label them as real data;
- live OpenAI smoke tests are opt-in and excluded from the default test suite.

## 12. Observability

Slice 1 records structured events and provider-call telemetry in memory. Later persistence will move this to PostgreSQL/PostGIS plus an outbox/event transport without changing domain interfaces.

The OpenAI agent layer uses Agents SDK tracing when live credentials are present. Application telemetry must distinguish:

- workflow transition failures;
- provider failures;
- tool failures;
- model/agent failures;
- validation failures.

## 13. Deferred from Slice 1

The following are intentionally deferred while interfaces are created now:

- real municipal/state ingestion adapters;
- real skip-tracing vendors;
- real ElevenLabs/OpenAI realtime telephony session routing;
- production e-signature provider;
- production settlement/title integrations;
- PostgreSQL/PostGIS persistence and migrations;
- operator web UI;
- learned buyer ranking model;
- autonomous retraining or prompt promotion.

## 14. Definition of done for Slice 1

Slice 1 is complete when:

- the repository installs cleanly on Node.js 22+;
- typecheck passes;
- all unit/contract/acceptance tests pass;
- one CLI smoke command prints an archived completed-transaction summary from the deterministic fixture;
- the domain package has no forbidden external dependencies;
- the live OpenAI provider compiles but default tests do not require network or credentials;
- the design and implementation plan are committed in git.
