# Review: optional trusted worker integrations

When a public function returns, its invocation-scoped vault token is revoked. A background service therefore needs its own durable, project-scoped identity to continue work without retaining a user's refresh token or connecting directly to PostgreSQL.

This change adds an optional control-server broker: administrators register a machine identity and assign project/secret grants; the worker discovers its projects, obtains renewable short-lived service-role API-key credentials, and resolves explicitly permitted vault secrets. Persistent grants/leases/API-key rows support restart and revocation. The broker is disabled by default. Existing user/ordinary API-key signing and function invocation paths are preserved.

## Review scope

- Worker module, machine guard, admin/internal endpoints, platform migration and revocation triggers.
- Separate bounded-TTL signing method; existing API-key/user signing remains in place.
- Sensitive header/credential redaction and metadata-only worker audit events.
- Opt-in environment forwarding in source/distribution Compose and both env examples; defaults are false/300 seconds.
- Five focused unit tests and standalone [usage](worker-integrations.md), [validation](worker-integrations-validation.md), [deferred tests](worker-integrations-follow-ups.md) and sanitized live evidence.

No app-specific Rust engine, job RPCs, frontend, production release tag, MinIO image migration or workflow engine is included in this BaaS feature branch. The package version remains 0.8.2 until a release is explicitly prepared; build an independently named review image.

## Validation

The external two-project/one-Rust consumer harness passed all 63 recorded live assertions. Existing SDK tests (18) and feature tests (5) passed, and the control-server built successfully. This branch adds declarative default-disabled env wiring and documentation to that tested feature source. Packaging checks revalidate the source build/tests and Compose default/opt-in values; they do not rerun the live harness.

## Deferred by explicit scope decision

[WI-REG-01](worker-integrations-follow-ups.md): worker-disabled existing BaaS full-stack compatibility and migration down/up.

[WI-REC-02](worker-integrations-follow-ups.md): control-server restart during active work and bounded temporary BaaS outage/recovery.

Both remain parked for separate execution. Passing this review's checks does not close them or approve a production rollout.
