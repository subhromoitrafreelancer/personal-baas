# Worker Integrations validation record

Date: 22 October 2026. This is a review candidate, not a production release.

## Completed evidence

- Changed NestJS control-server build passed.
- Five feature unit tests passed, covering existing/worker JWT lifetimes, existing storage guard acceptance/revocation, default disablement and machine identity, secret scoping and transaction cleanup.
- All 18 existing client SDK tests passed.
- An external consumer harness ran against a real disposable Docker stack with two BaaS projects and one internal Rust instance: **63 assertions passed**.
- The operator confirmed browser sign-in with both projects' own credentials, master-item add/delete and a visible mock JSON artifact in project B. Browser reload was not separately confirmed.

The raw sanitized snapshots are in [worker-integrations-evidence/](worker-integrations-evidence/). They contain assertion statuses and observations, not provider values, passwords or API/machine tokens. The application-specific Rust/SQL/function/UI harness is not part of this generic BaaS branch.

## What the live harness exercised

Real master CRUD, authenticated durable admission/idempotency, cross-schema user/worker denial, machine/project leases, short JWT lifetimes and explicit expiry, project-specific vault resolution/allowlists, Rust restart recovery from BaaS checkpoints, concurrent claims/stale fencing, private storage upload/checked read/hash, cross-project artifact denial, control-server lease persistence and project A grant revocation while B remained accessible.

## Boundaries and execution corrections

- AI, website generation and VPS work were deterministic mocks.
- Control-server restart occurred after the primary jobs completed. Active-work outage behaviour remains [WI-REC-02](worker-integrations-follow-ups.md).
- The first expiry assertion failed because a 35-second wait overlooked PostgREST's 30-second skew allowance. The corrected harness waits until actual token expiry plus allowance/margin and requires an explicit 401 `PGRST301` / `JWT expired`. Platform validation was unchanged.
- Inherited Docker Hub MinIO images could not be pulled. The consumer used verified, digest-pinned Chainguard server and client images, an isolated volume-permissions initializer and client-based readiness. These deployment overrides are not part of the generic worker feature. The standard BaaS source/distribution Compose MinIO references have not been updated here; do not assume a fresh standard stack can pull them.
- The feature-enabled Docker image was built/run by the operator; the coding session inspected generated evidence and ran local checks. No production rollout, image publication or merge was performed.

## Not completed

[WI-REG-01 and WI-REC-02](worker-integrations-follow-ups.md) are explicitly parked. Local SDK tests do not prove full-stack compatibility. Mock artifact completion does not prove real deployment rollback. A passing consumer spike supports continuing MVP development on the architecture; it does not establish production readiness.
