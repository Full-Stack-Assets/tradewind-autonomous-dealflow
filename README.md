# Tradewind Autonomous DealFlow

Greenfield, autonomy-first real-estate wholesale lifecycle platform for Massachusetts and Rhode Island. A durable state machine owns execution; AI and external providers operate through typed adapters.

## Implemented system

- deterministic source normalization and qualification;
- official-source-shaped MassGIS and Rhode Island ingestion boundaries with provenance and unknown-field preservation;
- resumable workflow checkpoints, optimistic versions, leases, domain events, provider calls, and transactional outbox;
- PostgreSQL 16/PostGIS 3.4 migration and runtime adapter;
- simulated and live-shaped enrichment, seller AI, voice, signature, buyer-outreach, and closing adapters;
- deterministic buyer filtering/ranking and document artifact hashing;
- operator API, worker loop, telemetry, evaluation matrix, Docker Compose packaging, CI, backup/recovery, and release evidence.

All committed fixture identities, addresses, buyers, and transactions are explicitly synthetic.

## Requirements

- Node.js 22+
- npm
- PostgreSQL 16 with PostGIS 3.4 for durable production mode
- Docker Compose for the packaged local stack

## Commands

```bash
npm install
npm test
npm run typecheck
npm run eval
npm run smoke
npm run migrate -- --check
npm run verify:release
```

Runtime commands:

```bash
npm run migrate
npm run api
npm run worker
```

Without `DATABASE_URL`, the API uses in-memory persistence for a self-contained simulation. With `DATABASE_URL`, API and worker share durable PostgreSQL state. The default provider mode is `simulated`; `live` mode requires the full credential/configuration set documented in `docs/runbooks/PROVIDER_ACTIVATION.md`.

## Container stack

```bash
cp .env.example .env
# Fill the required local database values. Keep secrets out of Git.
docker compose up --build
```

See `docs/architecture`, `docs/runbooks`, and `docs/release` for system, source, provider, recovery, and verification details.
