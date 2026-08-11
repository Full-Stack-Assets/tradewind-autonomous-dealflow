# Tradewind Capability and Evidence Matrix

- Candidate implementation commit: `31696ca7ba57c60aea6e9863da2395f44e8d77e0`
- Verified baseline: `2fffeb0689bc1f48153a462e215c326eeab8369c`
- Baseline evidence commit: `caa970908b51b8decac6c5c3824fe9e59e4e138c`
- Canonical local release commit: `afaa270f428f6b06579ff9d5d8c1a5f242e620e0`
- Hosted source import commit: `f775570eeb905461a213bbb093dd5b06a2df5876`
- Shared canonical source-tree hash: `f9f4e222d1b67d27e69dc529d4b50db370204775`
- Assessment date: 2026-08-11

## Status definitions

- **Implemented** — committed production or operational behavior exists.
- **Locally verified** — credential-free tests, typecheck, smoke, eval, or static verification passed.
- **Live verified** — the named external endpoint or account was actually exercised successfully.
- **Blocked** — a required runtime, credential, destination, or interactive authorization is unavailable.
- **Deferred** — intentionally excluded by an operator decision.

## Matrix

| Capability | Implemented | Locally verified | Live verified | Status and evidence |
|---|---:|---:|---:|---|
| Canonical release baseline | Yes | Yes | N/A | `2fffeb0`; baseline report at `caa9709` recorded 52/52 tests and 9/9 release gates. |
| Credential-safe provider readiness | Yes | Yes | No | `db0e628`; preflight exposes environment-variable names only and never promotes configuration to live verification. |
| ElevenLabs signed session | Yes | Yes | No | Canonical boundary plus `df36b88`; live account credentials are unavailable. |
| ElevenLabs outbound call and conversation retrieval | Yes | Yes | No | `df36b88`; E.164, phone configuration, idempotency, identity matching, and transcript normalization are tested with an injected transport. No call was placed. |
| Privacy-minimized source preflight | Yes | Yes | Yes | `b4d2f45` and `31696ca`; only source metadata/count and the RI directory were requested. No parcel or owner attributes were retrieved. |
| MassGIS property-tax parcel source | Yes | Yes | Yes | `31696ca`; current item `73d4c766167848b795f1048cad3919c7` resolved to layer 0 with `OBJECTID`, 2,559,286 records, max page size 2,000, pagination enabled, ArcGIS version 12. |
| Rhode Island municipal source directory | Yes | Yes | Yes | `31696ca`; live RI.gov page parsed 39 municipalities and five vendor families while retaining tax-only municipalities. |
| Reproducible dependency lock | Yes | Yes | N/A | `791a924`; fresh `npm ci` installed 118 packages, 60/60 tests and typecheck passed in the clean export, and production audit reported 0 vulnerabilities. |
| Reproducible container/CI install contract | Yes | Yes | No | `89f8994`; Dockerfile and CI use `npm ci`, Node 22, a non-root runtime, and committed lockfile. Docker is unavailable in this execution environment. |
| PostgreSQL/PostGIS schema, migrations, leases, and readiness | Yes | Yes | No | Static migration check plus 8 focused schema/readiness/lease/packaging tests passed. Blocked by missing Docker/Podman, PostgreSQL clients, and `DATABASE_URL`. |
| PostgreSQL backup and restore recovery | Runbook only | Static only | No | `pg_dump`/`pg_restore` recovery path is documented. No database runtime exists here, so backup integrity and restore recovery remain blocked. |
| OpenAI seller reasoning | Yes | Contract only | No | Missing `OPENAI_API_KEY`; no live request was made. |
| OpenAI transcript interpreter | No | N/A | No | **Deferred by operator decision.** It is not included as a configured or live capability. |
| Enrichment HTTP adapter | Yes | Yes | No | Missing endpoint and API key. |
| Signature HTTP adapter | Yes | Yes | No | Missing endpoint and API key. |
| Buyer-outreach HTTP adapter | Yes | Yes | No | Missing endpoint and API key. |
| Closing HTTP adapter | Yes | Yes | No | Missing endpoint and API key. |
| Outbox webhook publisher | Yes | Yes | No | Missing endpoint and API key. |
| Release source ZIP and full Git bundle | Yes | Yes | N/A | A committed clean branch head was packaged; ZIP integrity, bundle completeness, and both SHA-256 checksums were independently verified. Exact artifact commit, filenames, and checksums are carried by the companion checksum manifest and final handoff. |
| GitHub repository and canonical source publication | Yes | Yes | Yes | Private repository `Full-Stack-Assets/tradewind-autonomous-dealflow` is active. Connector import commit `f775570` records local release `afaa270`; its root tree `f9f4e22` exactly matches the local canonical root tree. Original Git history was not preserved. |
| Hosted GitHub Actions CI | Yes | Yes | Yes | PR head `7c30687` completed Actions run `31531581399` successfully. The `verify` job passed `npm ci`, tests, typecheck, evals, and the release verifier; the independent `container` job built the Docker image successfully. |

## Current candidate verification

The exact canonical local release `afaa270f428f6b06579ff9d5d8c1a5f242e620e0` passed a lockfile-driven install, 62/62 tests, typecheck, deterministic smoke, 10/10 evals, and 9/9 integrated release gates. The generated verification report intentionally retains external PostgreSQL and provider gates as unexecuted. The production-code candidate remains `31696ca7ba57c60aea6e9863da2395f44e8d77e0`; the intervening commits update evidence and documentation only.

## Hosted CI verification

GitHub Actions run `31531581399` verified hosted PR head `7c30687113d5567d1f7f68af7d98f2eb909b107a`. Both jobs completed with a `success` conclusion: `verify` ran the lockfile install, test suite, TypeScript check, evaluations, and integrated release verifier; `container` completed the repository Docker build. This verifies the hosted source and build contracts, not any credentialed provider or live PostgreSQL operation.
