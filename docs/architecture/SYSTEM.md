# Tradewind Autonomous DealFlow System Architecture

Tradewind is a TypeScript modular monolith with durable workflow boundaries. The workflow engine—not an AI agent—owns lifecycle state, retries, resumability, event emission, and completion. AI and provider adapters return typed results; domain and workflow services perform mutations.

## Lifecycle

`source snapshot → normalized property → qualification → enrichment → seller acquisition → negotiated deal → acquisition document/signature → buyer matching → assignment → closing → fee event → archive`

Every material transition persists a checkpoint, domain events, provider-call telemetry, and transactional outbox records together. PostgreSQL 16 with PostGIS 3.4 is the production persistence target. The in-memory implementation exists for deterministic tests and local simulations.

## Boundaries

- `packages/domain`: data contracts, normalization, scoring, deterministic business rules.
- `packages/persistence`: transactional store port, memory implementation, PostgreSQL implementation, node-postgres adapter.
- `packages/workflows`: resumable state-machine orchestration and autonomous system composition.
- `packages/ingestion`: source transports, MassGIS mapping, Rhode Island source registry, cursor/deduplication health.
- `packages/providers`, `packages/ai`, `packages/voice`: credential-gated provider adapters.
- `packages/documents`: canonical rendering, hashing, and artifact verification.
- `packages/telemetry`: immutable metric snapshots.
- `apps/api`, `apps/worker`: operator/read API and autonomous worker loops.

The domain package has no database, HTTP, GIS SDK, voice, or model-provider dependency.
