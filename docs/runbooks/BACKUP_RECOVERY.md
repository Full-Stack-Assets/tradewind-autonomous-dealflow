# Backup and Recovery Runbook

## Backup

Use PostgreSQL-native backups and protect them as sensitive operational data:

```bash
pg_dump --format=custom --no-owner --file=tradewind.dump "$DATABASE_URL"
```

Record the application commit, migration version, backup timestamp, and checksum alongside the backup.

## Restore

Restore into an empty, access-controlled database with PostGIS available:

```bash
pg_restore --clean --if-exists --no-owner --dbname="$RECOVERY_DATABASE_URL" tradewind.dump
```

After restore, run `npm run migrate`, verify `/ready`, compare workflow/event counts, and inspect pending **outbox** records before starting workers. Outbox dedupe keys and published timestamps are part of recovery integrity; do not bulk-reset them without a documented replay decision.

## Workflow recovery

Workers claim checkpoints with leases. An interrupted lease becomes reclaimable after expiry. Exception checkpoints retain their failed stage and structured context so they can resume without repeating completed provider operations.
