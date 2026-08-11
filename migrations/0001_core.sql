BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE workflow_runs (
  workflow_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('runnable', 'waiting', 'exception', 'completed')),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  next_run_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ
);

CREATE TABLE workflow_checkpoints (
  workflow_id TEXT PRIMARY KEY REFERENCES workflow_runs(workflow_id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  state TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('runnable', 'waiting', 'exception', 'completed')),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  next_run_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ
);
CREATE INDEX workflow_checkpoints_status_claim_idx
  ON workflow_checkpoints (status, next_run_at, lease_expires_at, updated_at);

CREATE TABLE domain_events (
  event_id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_runs(workflow_id) ON DELETE CASCADE,
  sequence_number BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  schema_version TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workflow_id, sequence_number)
);
CREATE INDEX domain_events_workflow_idx ON domain_events (workflow_id, sequence_number);

CREATE TABLE provider_calls (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_runs(workflow_id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  correlation_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX provider_calls_workflow_idx ON provider_calls (workflow_id, started_at);

CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflow_runs(workflow_id) ON DELETE CASCADE,
  event_id TEXT REFERENCES domain_events(event_id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  last_error TEXT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ
);
CREATE INDEX outbox_status_claim_idx
  ON outbox (status, available_at, lease_expires_at, created_at);

CREATE TABLE source_snapshots (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  retrieved_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL,
  geometry geometry(Geometry, 4326),
  UNIQUE (source_key, content_hash)
);
CREATE INDEX source_snapshots_record_idx ON source_snapshots (source_key, source_record_id, retrieved_at DESC);
CREATE INDEX source_snapshots_geometry_idx ON source_snapshots USING GIST (geometry);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  parcel_snapshot_id TEXT,
  parcel_id TEXT NOT NULL,
  address1 TEXT NOT NULL,
  city TEXT NOT NULL,
  state CHAR(2) NOT NULL CHECK (state IN ('MA', 'RI')),
  postal_code TEXT NOT NULL,
  property_type TEXT NOT NULL,
  assessed_value_cents BIGINT,
  estimated_mortgage_balance_cents BIGINT,
  owner_name TEXT,
  owner_mailing_state TEXT,
  vacancy_indicator BOOLEAN,
  distress_indicator BOOLEAN,
  source_lineage JSONB NOT NULL,
  raw_facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  geometry geometry(Geometry, 4326),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX properties_state_city_idx ON properties (state, city);
CREATE INDEX properties_geometry_idx ON properties USING GIST (geometry);

CREATE TABLE buyers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  buy_box JSONB NOT NULL,
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE completed_transactions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL UNIQUE REFERENCES workflow_runs(workflow_id) ON DELETE RESTRICT,
  payload JSONB NOT NULL,
  assignment_fee_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION claim_runnable_workflows(
  p_limit INTEGER,
  p_lease_owner TEXT,
  p_lease_seconds INTEGER,
  p_now TIMESTAMPTZ
) RETURNS SETOF workflow_checkpoints
LANGUAGE sql
AS $$
  WITH candidates AS (
    SELECT checkpoint.workflow_id, checkpoint.version
    FROM workflow_checkpoints AS checkpoint
    WHERE checkpoint.status = 'runnable'
      AND (checkpoint.next_run_at IS NULL OR checkpoint.next_run_at <= p_now)
      AND (checkpoint.lease_expires_at IS NULL OR checkpoint.lease_expires_at <= p_now)
    ORDER BY checkpoint.updated_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), updated_runs AS (
    UPDATE workflow_runs AS run
    SET lease_owner = p_lease_owner,
        lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
        version = run.version + 1,
        updated_at = p_now
    FROM candidates AS checkpoint
    WHERE run.workflow_id = checkpoint.workflow_id
      AND run.version = checkpoint.version
    RETURNING run.workflow_id, run.version, run.lease_owner, run.lease_expires_at, run.updated_at
  ), updated_checkpoints AS (
    UPDATE workflow_checkpoints AS checkpoint
    SET lease_owner = run.lease_owner,
        lease_expires_at = run.lease_expires_at,
        version = run.version,
        updated_at = run.updated_at
    FROM updated_runs AS run
    WHERE checkpoint.workflow_id = run.workflow_id
      AND checkpoint.version = run.version - 1
    RETURNING checkpoint.*
  )
  SELECT * FROM updated_checkpoints;
$$;

CREATE OR REPLACE FUNCTION claim_outbox(
  p_limit INTEGER,
  p_lease_owner TEXT,
  p_lease_seconds INTEGER,
  p_now TIMESTAMPTZ
) RETURNS SETOF outbox
LANGUAGE sql
AS $$
  WITH candidates AS (
    SELECT id
    FROM outbox
    WHERE status = 'pending'
      AND available_at <= p_now
      AND (lease_expires_at IS NULL OR lease_expires_at <= p_now)
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE outbox AS record
  SET lease_owner = p_lease_owner,
      lease_expires_at = p_now + make_interval(secs => p_lease_seconds)
  FROM candidates
  WHERE record.id = candidates.id
  RETURNING record.*;
$$;

COMMIT;
