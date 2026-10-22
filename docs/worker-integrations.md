# Using the BaaS Worker Integrations feature

This is a generic personal-baas feature for trusted background services. It lets a Rust server, Python worker or other internal service discover its assigned projects, obtain short-lived project API credentials and resolve approved project vault secrets after a browser request has ended.

The first implementation is API-only. There is no new admin page or UI toggle. The feature is prepared on the `feature/worker-integrations` review branch. It is not part of the published 0.8.2 image. Build an explicitly tagged review image; do not overwrite a stable release tag.

See [validation evidence](worker-integrations-validation.md), [deferred tests](worker-integrations-follow-ups.md), and the [review notes](worker-integrations-review.md). Full-stack regression and failure-recovery tests are explicitly deferred; production rollout is not approved by the spike alone.

## 1. Install the feature-enabled control server

Build/release the control-server source containing `WorkerModule` and migration `1785900000000_worker-integrations.ts`. Use the same new image for control-server and the migration service. Apply platform migrations through the existing BaaS migration mechanism before the server starts.

The migration adds:

- `platform.worker_integrations`: worker identity, hashed machine credential, enabled state.
- `platform.worker_project_grants`: integration/project assignment and allowed vault secret names.
- `platform.worker_project_leases`: persistent short-lived credential lease and associated API-key row.

Existing ordinary auth/API-key signing paths remain in place. These tables belong to BaaS; a worker does not access them directly.

## 2. Enable the feature in the container environment

```yaml
services:
  control-server:
    environment:
      WORKER_INTEGRATIONS_ENABLED: "true"
      WORKER_LEASE_TTL_SECONDS: "300"
```

Defaults are disabled and a 300-second lease. TTL validation accepts integers from 5 to 3600 seconds. The spike uses 20 seconds only to exercise renewal/expiry rapidly.

The source and distribution Compose files in this branch forward these two variables to `control-server`; both `.env.example` files document their defaults. Custom Compose files must forward them too. Recreate the control-server container after changing its environment. Keep the internal worker routes off the public proxy; use the internal control-server address over the private service network.

The global flag gates the new admin/broker endpoints. It does **not** automatically revoke previously issued API-key records. For immediate removal of issued access, disable the relevant grant/integration before switching the feature off.

## 3. Register a trusted worker identity

Generate one cryptographically random machine credential. The provisioner uses Python's `secrets.token_urlsafe(48)`. The API accepts URL-safe characters (`A–Z`, `a–z`, digits, underscore, hyphen), length 43–128.

Provision it through a protected file or secret mount for the worker. Send it once to the BaaS registration endpoint using an existing platform-admin session:

```http
POST /admin/v1/worker-integrations
Content-Type: application/json
```

```json
{
  "name": "example-background-engine",
  "credential": "<generated-machine-credential>"
}
```

Save the returned integration `id`. BaaS stores a SHA-256 verifier, not the plaintext credential, and does not return the credential in the registration response. It is separate from user JWTs, project API keys and provider secrets. This bootstrap credential is the one credential the worker needs before it can ask BaaS for project-specific access.

All admin operations below require the existing admin-session cookie. No admin cookie belongs in the browser application or Rust worker.

## 4. Assign projects and allowed secrets

For each existing BaaS project:

```http
POST /admin/v1/worker-integrations/<integration-id>/grants
Content-Type: application/json
```

```json
{
  "project_id": "<project-uuid>",
  "allowed_secret_names": ["PROVIDER_API_TOKEN", "DEPLOYMENT_PRIVATE_KEY"],
  "enabled": true
}
```

This creates or updates the assignment. Secret names are uppercase environment-style identifiers. An empty list permits no vault-secret reads. Provision actual values separately through the existing BaaS vault admin API/UI; a grant does not create secrets.

The data credential has the project's service-role access, including its RLS bypass. The secret-name allowlist limits vault resolution, not table access. Project/schema role isolation remains the cross-project boundary. One trusted integration can receive grants for many projects, which is how two BaaS projects used one Rust instance in the spike.

## 5. Worker runtime API

All these requests go to the internal control-server and carry:

```http
Authorization: Bearer <machine-credential>
```

| Operation | Endpoint | Body |
|---|---|---|
| Discover permitted projects | `GET /internal/worker/v1/projects` | None |
| Obtain project API credential | `POST /internal/worker/v1/projects/<project-id>/leases` | `{}` |
| Renew active lease | `POST /internal/worker/v1/leases/<lease-id>/renew` | `{}` |
| Read allowed vault secret | `POST /internal/worker/v1/leases/<lease-id>/secrets/resolve` | `{"name":"PROVIDER_API_TOKEN"}` |

Discovery returns canonical `id`, `slug` and `schema_name` for enabled project grants. A lease response contains:

```json
{
  "lease_id": "<lease-uuid>",
  "project_id": "<project-uuid>",
  "schema_name": "api_example",
  "service_role": "service_role_example",
  "api_key": "<short-lived-project-api-key-jwt>",
  "expires_at": "<ISO-8601-expiry>"
}
```

Use **that `api_key`**, not the machine credential, for normal BaaS data/storage requests:

```http
GET /rest/v1/your_table
Authorization: Bearer <api_key>
Accept-Profile: api_example
```

For writes and RPCs, use `Content-Profile: api_example`. Storage uses the existing `/storage/v1/...` API and the same project API credential. A secret-resolution response is `{"value":"..."}`; the project comes from the authorized lease, never a caller-supplied secret-request field.

Renew before expiry, allowing time for API calls and network latency. Renewal requires an unexpired lease, enabled integration/grant and nonrevoked API key. It re-signs the same key identity with a new expiration. Old JWT copies retain their original expiry unless the key is revoked. After expiry, obtain a new lease rather than trying to renew the expired one.

Validate every returned project's canonical metadata against the worker's intended project context. Cache credentials per project, never under one global tenant-key variable. On restart, rediscover grants and obtain fresh leases; browser/refresh/invocation tokens are unnecessary for continued background work.

## 6. Revocation and re-enabling a project

Disable one project using the same grant endpoint and its full body, with `enabled: false`. This revokes that grant's existing worker API-key rows and prevents new leases, renewals and vault reads. Other project grants remain active.

Re-enable it with `enabled: true` and the desired complete `allowed_secret_names` list. The worker must obtain a **new lease/key**. Previously revoked identities are not resurrected.

To disable all project access for one integration:

```http
POST /admin/v1/worker-integrations/<integration-id>/disable
```

Integration disablement currently has no corresponding re-enable endpoint. Credential rotation also has no dedicated API yet. A replacement identity can be registered under a new name, granted its projects, and provisioned to the worker before disabling the old identity.

A worker grant does not disable normal application users or master-data access. This was verified in the spike: project A sign-in and ordinary reads still worked after A's worker access was revoked.

PostgREST 12.2.3 allows 30 seconds of JWT clock skew; natural token-expiry acceptance can therefore differ from strict lease/broker/storage checks. Explicit key revocation is checked through the existing REST/storage revocation paths and was validated by the live harness.

## 7. What remains application responsibility

Worker Integrations is not a job queue or workflow engine. The consuming application still owns job tables/RPCs, claim/heartbeat fencing, user command admission, business rules, provider connectors, artifacts and deployment logic.

The tested flow is:

```text
Browser -> BaaS user auth / ordinary project CRUD
Browser -> project function -> Rust command / durable enqueue
Rust -> worker broker -> project credential / permitted secrets
Rust -> BaaS REST/RPC/storage -> job progress and results
```

For user-triggered commands, preserve the original user identity and canonical project context at admission. Machine access is for authorized backend work, not a substitute for checking the requesting user.

## 8. Review image and administration gaps

To build a distinctly tagged control-server review image from this branch:

```bash
docker build -f apps/control-server/Dockerfile -t personal-baas-control-server:worker-integrations-review .
```

The distribution kit already uses `BAAS_CONTROL_SERVER_IMAGE` for both the migration service and control-server. In an isolated review installation, point that variable to the review tag. The source Compose file builds the checked-out feature source for both services. Do not replace a live installation until the deferred compatibility checks have been reviewed.

The consumer spike already has a registered integration and two project grants. Its final test deliberately disables A's worker grant while leaving B active. Re-enable an existing project via its grant endpoint, rather than registering everything again.

There are no admin list/detail, credential rotation, or integration re-enable APIs yet. Expired lease/key retention is also deferred. The registration/grant/disable API supports scripted provisioning; it is not a complete admin management UI. See [follow-ups](worker-integrations-follow-ups.md).

The spike's Chainguard MinIO adaptation was an application deployment override, separate from this feature branch. The inherited BaaS distribution still contains the old MinIO registry references; see the [validation notes](worker-integrations-validation.md) before reproducing a fresh full stack. Worker Integrations does not alter the existing storage API.
