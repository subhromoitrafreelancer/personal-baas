# Worker Integrations: admin UI scope

Status: **implemented for 0.8.3** (page `/admin/workers`, endpoints below). Expired lease/key cleanup remains deferred. Target release: **control-server 0.8.3**, which will ship worker integrations and this UI together (current published version is 0.8.2; the version bump happens at release time). Today the feature is API-only (see [worker-integrations.md](worker-integrations.md)); provisioning is done with scripted `POST /admin/v1/worker-integrations*` calls. This document scopes the admin-console surface needed to manage it without curl.

## Goals

1. Register, inspect, grant, and disable worker integrations from the console.
2. Make the sensitive parts safe: the machine credential is shown once at creation and never again; grants clearly state they confer service-role data access.
3. Fit the existing console: Handlebars page + frameworkless JS/CSS, `AdminPageAuthFilter` page controller, `AdminSessionGuard` JSON controller, `DESIGN.md` tokens.

## Placement

- New page `/admin/workers`, nav link under the existing **Integrations** group in `views/partials/topbar.hbs` (beside Vault / Email / PDF).
- Files following the vault pattern: `worker-page.controller.ts`, `views/workers.hbs`, `public/js/workers.js`, `public/css/workers.css`.
- The page is hidden or shows an empty "feature disabled" state when `WORKER_INTEGRATIONS_ENABLED=false` (admin endpoints already return 404 then). The page needs a way to learn this, e.g. the list endpoint returns 404 and the UI renders an explanation with the env var name.
- Unlike Vault, this page is **integration-scoped, not project-scoped**: one integration spans many projects, so do not use the project selector as the page filter. Project appears as a column and as a selector inside the grant dialog.

## Screens

### 1. Integrations list (main view)
Table: Name, Status badge (enabled / disabled), Projects (count of enabled grants), Active leases, Last lease renewal, Created. Row click opens the detail panel. Primary action: **Register integration**.

### 2. Register integration (modal)
- Name field.
- Credential is **generated server-side** (decision). The register endpoint gains a mode where `credential` is omitted and the server generates a 48-byte base64url value (meets the 43–128 char rule), stores only the SHA-256 hash, and returns the plaintext once in the response. The existing caller-supplied `credential` body stays supported for scripted provisioning; the UI uses the generated mode only, so no paste-your-own option.
- On success, show the credential once in a copy-able, masked-by-default block with a "I have stored it" confirmation before the dialog can close. Never re-display; the list/detail never contain it.
- Follows the vault "values are never shown again" wording.

### 3. Integration detail
- Header: name, id, status, Disable button (confirm modal; states that this revokes all issued worker API keys immediately and **cannot currently be undone**).
- Grants table: Project (name/slug), Allowed secret names (chips), Enabled, Updated. Actions: Edit, Disable/Enable grant.
- Leases (read-only, **all lease information shown**): full lease id, project, linked API key id, issued/created time, expires_at, last_renewed_at, revoked_at, and derived state (active / expired / revoked). Useful for answering "is the worker alive?" and for audit. Never shows the JWT itself.

### 4. Grant editor (modal)
- Project picker (from `/admin/v1/projects`), enabled toggle.
- Allowed secret names: multi-select populated from that project's vault secret names (names only, never values), with free-text add for names not yet created. Validates `^[A-Z][A-Z0-9_]{0,199}$`, max 100.
- Warning banner: "This grant gives the worker the project's service-role data access, including RLS bypass. The secret list restricts vault reads only."
- Disabling a grant uses the confirm modal and explains new leases are required on re-enable.

### 5. Audit integration
Audit Log page already lists events; add filter/labels for `worker.integration_registered`, `worker.grant_updated`, `worker.integration_disabled`, `worker.secret_read`.

## Backend work the UI requires

Existing endpoints cover register, grant (upsert/disable) and integration disable. Missing:

| Need | Proposed endpoint |
|---|---|
| List integrations with grant/lease counts | `GET /admin/v1/worker-integrations` |
| Detail: grants + all lease fields (needs `created_at` on leases if not already stored; the table has none today, so add via migration or take it from the linked `api_keys` row) | `GET /admin/v1/worker-integrations/:id` |
| Feature-enabled signal | included in list response or `GET .../status` |
| Re-enable integration | `POST /admin/v1/worker-integrations/:id/enable` |
| Rotate credential | `POST /admin/v1/worker-integrations/:id/credential` (server generates, hard-swap: old credential stops working immediately; return new one once) |
| Revoke single lease | `POST /admin/v1/worker-integrations/:id/leases/:lease/revoke` (optional, phase 2) |
| Delete integration | `DELETE /admin/v1/worker-integrations/:id` (migration trigger already revokes keys on delete) |
| Expired lease/key cleanup | scheduled job or admin action (already listed as a follow-up) |

List/detail responses must never include `credential_hash`. All new routes keep the 404-when-disabled behavior and write audit events.

## Phasing

1. **Read-only + register**: list, detail, register-with-generate, feature-disabled state. Backend: list/detail endpoints.
2. **Grants**: grant editor, enable/disable per grant, secret-name picker. Backend: none beyond phase 1 (reuses grant endpoint).
3. **Lifecycle**: integration re-enable, credential rotation, lease revoke, audit labels.

## Decisions

- Credentials are generated server-side; the browser never creates or pastes one.
- Rotation is a hard swap, no overlap window. The UI confirm dialog must warn that the worker will fail authentication until it is given the new credential.
- Lease detail shows every field the platform holds (not just an aggregate "last seen").

## Open questions (resolved)

- None. Resolved: the nav link is always shown; with the flag off the page renders an explanation.

## Out of scope

Job queue/workflow views, worker logs, and any browser-side use of the machine credential.
