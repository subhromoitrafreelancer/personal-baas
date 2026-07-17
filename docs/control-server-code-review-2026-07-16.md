# Control Server Code Review - 2026-07-16

Scope: `apps/control-server`, focused on security, auth/admin permissions, and production reliability. This review used the codebase memory graph first, then targeted source reads for exact references. No product code was changed.

## Findings

### High - Admin sessions remain valid after admin removal or credential changes

Admin session authorization only verifies that the cookie JWT is signed and unexpired. It does not re-check `platform.platform_admins` or any revocation/password-version state before accepting the session.

Evidence:
- [admin-session.guard.ts](../apps/control-server/src/modules/admin-auth/admin-session.guard.ts:13) accepts any non-null result from `verifySessionToken`.
- [admin-auth.service.ts](../apps/control-server/src/modules/admin-auth/admin-auth.service.ts:93) verifies only the JWT signature and payload shape, then returns `{ sub, email }`.
- [admin-auth.service.ts](../apps/control-server/src/modules/admin-auth/admin-auth.service.ts:84) issues a 12-hour stateless token.

Impact: if an admin account is deleted, disabled in the database, has a password rotated, or otherwise needs emergency lockout, existing browser sessions remain usable until `ADMIN_SESSION_TTL_SECONDS` expires or the global `ADMIN_SESSION_SECRET` is rotated. This is worse than the API-key path, which checks revocation against storage on every request.

Recommendation: store admin sessions server-side or include a session id / token version and check it against `platform.platform_admins` on every guarded request. Add an explicit admin disabled/revoked state if admin lockout is expected.

### High - Refresh token rotation is raceable and can mint multiple valid child tokens

Refresh token rotation is implemented as separate read/update/insert statements with no transaction or conditional consume.

Evidence:
- [refresh.service.ts](../apps/control-server/src/modules/auth/refresh.service.ts:35) reads the token by hash.
- [refresh.service.ts](../apps/control-server/src/modules/auth/refresh.service.ts:40) checks `consumed_at` / `revoked_at` in application code.
- [refresh.service.ts](../apps/control-server/src/modules/auth/refresh.service.ts:65) marks the token consumed.
- [refresh.service.ts](../apps/control-server/src/modules/auth/refresh.service.ts:73) creates the replacement token.
- [auth-refresh-tokens.repository.ts](../apps/control-server/src/modules/auth/auth-refresh-tokens.repository.ts:45) updates `consumed_at` without `AND consumed_at IS NULL AND revoked_at IS NULL` or checking affected rows.

Impact: two concurrent refresh requests using the same raw refresh token can both observe it as unconsumed and each create a successor token. That breaks single-use rotation and can make token theft harder to detect reliably.

Recommendation: perform token lookup, conditional consume, session/user validation, and successor insert in one transaction. Make the consume step atomic, e.g. `UPDATE ... WHERE id = $1 AND consumed_at IS NULL AND revoked_at IS NULL RETURNING *`, and treat no returned row as reuse.

### Medium - Admin state-changing endpoints rely only on SameSite=Lax; there is no CSRF token

The admin console uses cookie authentication, and state-changing admin routes accept POST/PATCH/DELETE without CSRF tokens or origin checks.

Evidence:
- [admin-auth.controller.ts](../apps/control-server/src/modules/admin-auth/admin-auth.controller.ts:47) sets `baas_admin_session` with `httpOnly` and `sameSite: 'lax'`.
- [main.ts](../apps/control-server/src/main.ts:23) configures Helmet and CORS, but no CSRF middleware.
- [api-keys.controller.ts](../apps/control-server/src/modules/api-keys/api-keys.controller.ts:23) creates API keys from a cookie-authenticated POST.
- [admin-users.controller.ts](../apps/control-server/src/modules/admin-users/admin-users.controller.ts:45) changes user status from a cookie-authenticated PATCH.
- [storage-admin.controller.ts](../apps/control-server/src/modules/storage/storage-admin.controller.ts:50) creates buckets from a cookie-authenticated POST.

Impact: `SameSite=Lax` blocks many cross-site POST cookie sends in modern browsers, but it is not an application-level CSRF control and can be weakened by browser quirks, same-site subdomain compromise, or future route changes. These endpoints can create/revoke API keys, change users, run SQL, and manipulate storage.

Recommendation: add CSRF tokens for admin forms/API calls, or enforce strict `Origin`/`Sec-Fetch-Site` checks on all unsafe `/admin` methods. Consider `sameSite: 'strict'` for the admin cookie if cross-site navigation into the admin console is not required.

### Medium - Storage bucket size limits are not enforced

Bucket creation persists `sizeLimitBytes`, but object upload never checks it.

Evidence:
- [storage-admin.controller.ts](../apps/control-server/src/modules/storage/storage-admin.controller.ts:28) accepts `sizeLimitBytes`.
- [storage-buckets.repository.ts](../apps/control-server/src/modules/storage/storage-buckets.repository.ts:12) stores `size_limit_bytes`.
- [storage.service.ts](../apps/control-server/src/modules/storage/storage.service.ts:94) uploads `params.buffer` to MinIO with no comparison against `bucket.size_limit_bytes`.
- [1784400000000_create-storage-schema.ts](../apps/control-server/migrations/1784400000000_create-storage-schema.ts:17) defines `size_limit_bytes`.

Impact: admins may believe bucket size caps protect storage cost or abuse, but authenticated users can upload objects larger than the configured limit. This is both a policy bypass and a production reliability/cost issue.

Recommendation: reject uploads where `params.buffer.length` exceeds `bucket.size_limit_bytes`, and consider enforcing limits at the multipart parser layer too.

### Medium - Storage uploads are memory-buffered without route limits

Both app-facing and admin storage uploads use `FileInterceptor('file')` without `limits`, then pass `file.buffer` to MinIO.

Evidence:
- [storage-object.controller.ts](../apps/control-server/src/modules/storage/storage-object.controller.ts:37) uses `FileInterceptor('file')` without limits.
- [storage-object.controller.ts](../apps/control-server/src/modules/storage/storage-object.controller.ts:51) passes `file.buffer`.
- [storage-admin.controller.ts](../apps/control-server/src/modules/storage/storage-admin.controller.ts:65) also uses `FileInterceptor('file')` without limits.
- [sql-console.controller.ts](../apps/control-server/src/modules/sql-console/sql-console.controller.ts:55) shows the SQL upload route already has a `MAX_UPLOAD_BYTES` Multer limit, so this protection exists elsewhere but not storage.

Impact: an authenticated app user, or an admin session hit by accident/automation, can force the Node process to buffer large multipart uploads in memory. This can exhaust memory before MinIO or bucket metadata has a chance to apply backpressure.

Recommendation: add Multer `fileSize` limits to storage upload routes, align them with bucket `size_limit_bytes`, and consider streaming uploads rather than buffering entire files in process memory.

### Medium - Admin-created users always go into the default project

The admin users list endpoint is project-aware, but create always uses the default project and the API body has no `projectId`.

Evidence:
- [admin-users.controller.ts](../apps/control-server/src/modules/admin-users/admin-users.controller.ts:26) accepts `projectId` for listing.
- [admin-users.controller.ts](../apps/control-server/src/modules/admin-users/admin-users.controller.ts:42) calls `create` without a project id.
- [admin-users.service.ts](../apps/control-server/src/modules/admin-users/admin-users.service.ts:34) resolves `this.projects.getDefault()` for all created users.

Impact: in multi-project deployments, admins cannot create users for non-default projects via this endpoint/UI path. This also creates a permission/tenant-management footgun: an admin looking at one project can create a user that silently lands in another project.

Recommendation: add `projectId` to the create DTO and pass it through to `AuthUsersRepository.create`, defaulting only when the caller omitted a project explicitly.

### Low - Project provisioning can leave untracked database objects on partial failure

Project creation provisions schema/roles, then inserts the project row, then rewrites PostgREST config. These steps are not atomic and there is no cleanup on failure.

Evidence:
- [projects.service.ts](../apps/control-server/src/modules/projects/projects.service.ts:108) provisions schema and roles first.
- [projects.service.ts](../apps/control-server/src/modules/projects/projects.service.ts:115) inserts the project row afterwards.
- [projects.service.ts](../apps/control-server/src/modules/projects/projects.service.ts:128) updates PostgREST config after the database row exists.
- [projects.repository.ts](../apps/control-server/src/modules/projects/projects.repository.ts:92) performs multiple DDL statements outside an explicit transaction.

Impact: if role/schema provisioning partially succeeds, row insertion fails, or config writing fails, the deployment can be left in a state that blocks retries or exposes a project row not yet reachable through PostgREST. The code comments accept manual restart for PostgREST, but not partial database provisioning cleanup.

Recommendation: wrap database provisioning and project row insertion in a transaction where possible. For the config-file step, either make project activation explicit after config succeeds or persist a provisioning status that the UI can surface and retry.

### Low - Negative pagination values can reach SQL

Admin list endpoints coerce numeric query params but do not reject negatives.

Evidence:
- [admin-users.controller.ts](../apps/control-server/src/modules/admin-users/admin-users.controller.ts:30) accepts `Number(limit)` and `Number(offset)` without lower-bound validation.
- [audit.controller.ts](../apps/control-server/src/modules/audit/audit.controller.ts:13) has the same pattern.
- [auth-users.repository.ts](../apps/control-server/src/modules/auth/auth-users.repository.ts:79) passes those values to `LIMIT` / `OFFSET`.
- [auth-audit-events.repository.ts](../apps/control-server/src/modules/auth/auth-audit-events.repository.ts:40) does the same for audit events.

Impact: `?offset=-1` or `?limit=-1` can produce avoidable database errors and 500 responses from admin pages.

Recommendation: parse these with a shared schema that enforces `limit >= 1`, `offset >= 0`, and maximum limits.

## Verification

- `npm test --workspace apps/control-server` failed because there are no Jest tests in `apps/control-server`.
- `npm run build --workspace apps/control-server` passed.
- `npm run lint` passed.

## Open Questions

- Are platform admins intended to be global superusers only, or should there eventually be project-scoped admin roles? Current code treats every valid admin session as global.
- Should storage public buckets support anonymous API-key reads, or is the current access-token requirement intentional?
