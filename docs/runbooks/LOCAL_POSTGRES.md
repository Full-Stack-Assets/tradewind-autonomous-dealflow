# Local PostgreSQL/PostGIS Runbook

1. Copy `.env.example` to `.env` and set `POSTGRES_DB`, `POSTGRES_USER`, and a unique `POSTGRES_PASSWORD`.
2. Set provider mode to `simulated` for a credential-free local lifecycle.
3. Start the stack:

```bash
docker compose up --build
```

The `postgres` service must become healthy before the one-shot `migrate` service runs `npm run migrate`. The API listens on the configured host `PORT`; the worker claims resumable workflows and outbox rows using database leases.

Verification:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/ready
npm run migrate -- --check
```

For direct local execution, set `DATABASE_URL` and run `npm run migrate`, `npm run api`, and `npm run worker` in separate terminals.
