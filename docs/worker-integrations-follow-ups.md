# Worker Integrations: deferred acceptance tests

Status: **parked for a separate test effort**, per the feature owner's instruction. Neither item below was run as part of preparing this review branch. The successful consumer spike and unit tests are evidence for their recorded scopes only.

## WI-REG-01 — Existing BaaS compatibility and migration lifecycle

- State: deferred / untested.
- Scope: new control-server image with `WORKER_INTEGRATIONS_ENABLED=false`, compared with the previous released behaviour.
- Run only against disposable data/stack copies. Preserve original signing keys/identities in a compatibility fixture when checking that existing credentials remain usable.

Acceptance:

- [ ] Existing user signup/login/refresh/logout and project scoping behave as before.
- [ ] Existing publishable/service API keys retain their expected claims, lifetime and revocation behaviour.
- [ ] Existing public/project functions, invocation timeout and invocation-scoped vault callbacks work without the new worker identity.
- [ ] Existing storage upload/read/delete and private owner/project boundaries behave as before.
- [ ] Health/readiness, ordinary REST/RPC and admin console flows remain available.
- [ ] New worker admin/broker endpoints return 404 when the feature is disabled.
- [ ] Apply the worker migration, roll back that migration only, then reapply in the disposable database. Worker keys are revoked on rollback; legacy users, keys, vault/storage records and application schemas remain intact.
- [ ] Record baseline/new image IDs, configuration, request results, migration outputs and any differences, without credentials or secret values.

The migration adds platform tables even when the runtime feature is disabled. A successful build or disabled-feature 404 is not a substitute for the compatibility assertions above.

## WI-REC-02 — Active-work control-server restart and temporary BaaS loss

- State: deferred / untested.
- Scope: a real consumer worker using two project grants, real BaaS REST/RPC/storage/vault, deterministic long-running mock work.

Acceptance:

- [ ] Start recoverable jobs in both projects and establish active claims/checkpoints.
- [ ] Restart control-server while those jobs are active. Verify durable registration/grants/leases survive, the worker recovers after bounded retries, and checkpoints continue without another browser start command.
- [ ] Temporarily make the relevant BaaS endpoints unavailable. Verify bounded request timeouts/retries, no false success, and recovery when availability returns.
- [ ] Cover an outage longer than the short credential/claim lifetime. Fresh credentials and expired-claim takeover must work; stale workers cannot finalize results.
- [ ] Verify exactly one terminal completion and matching artifact metadata per logical job. A revoked worker must not attempt to bypass denial using another project's credential.
- [ ] Account for PostgREST 12.2.3's 30-second JWT clock-skew allowance when checking natural expiry. Require explicit expiry evidence rather than any generic denial.
- [ ] Capture sanitized timelines, claim generations, checkpoints, credential lease metadata and final data/artifact hashes.

The completed consumer spike restarted Rust during active work and restarted control-server after the primary jobs completed. Those passing checks do not close this active-work outage item. Real provider billing, SSH side effects and remote rollback remain outside this mocked recovery scenario.

## Other known follow-ups (outside these two tests)

Admin list/detail UI/API, machine credential rotation, integration re-enable, lease/key cleanup, log/browser inspection, and replacement of retired upstream MinIO distribution image references remain separate work. They are not silently included in this review branch or marked tested.
