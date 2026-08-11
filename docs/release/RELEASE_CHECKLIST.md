# Release Checklist

## Local gates

- [x] A fresh `npm ci` succeeds from the committed lockfile (executed on Node 24; Node 22 remains specified for CI/container verification).
- [x] `npm run verify:release` passes against final local verification input `b15fdec5634aaba358f6304281c7516cb1fb4318`; production-code candidate `31696ca7ba57c60aea6e9863da2395f44e8d77e0` is unchanged.
- [x] Tests, typecheck, evaluation matrix, offline smoke, migration schema checks, domain-boundary scan, forbidden-secret scan, and `git diff --check` pass.
- [ ] Docker image builds and runs as the non-root `node` user.

## Persistence

- [ ] PostgreSQL/PostGIS 16/3.4 starts and the migration applies to an empty database.
- [ ] API readiness verifies PostgreSQL/PostGIS connectivity.
- [ ] Worker lease, resume, transactional event/outbox, and backup/restore checks are exercised.

## Provider activation

- [ ] provider credentials are supplied through a secret-safe runtime path, never committed.
- [x] Simulated mode remains available for deterministic regression tests.
- [ ] Each live provider has an authenticated account-level smoke result before any live claim is made.

## Official sources

- [x] Privacy-minimized MassGIS metadata/count preflight succeeds against the current April 2026 FeatureServer.
- [x] Privacy-minimized RI.gov directory preflight parses all 39 municipalities.
- [x] No parcel or owner attributes are fetched by the preflight command.

## Evidence

- [x] Verification report names the tested commit and distinguishes local proof from external gates.
- [x] Capability/evidence matrix distinguishes implemented, locally verified, live verified, blocked, and deferred states.
- [x] A source ZIP and full Git bundle were generated from a committed clean branch head, independently verified, and accompanied by a checksum manifest. Exact artifact provenance is recorded in the final handoff rather than a self-referential repository filename.
