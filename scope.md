# 1. Product Definition

Build a lightweight, self-hosted Backend-as-a-Service that converts a PostgreSQL schema into immediately usable APIs.

The initial product should provide:

1. PostgreSQL database
2. Browser-based SQL editor
3. Automatic REST APIs for tables, views and functions
4. Authentication and user management
5. JWT-based API authorization
6. JavaScript/TypeScript client SDK
7. Minimal administration console

Do **not** initially build the database-to-API engine yourself. Use **PostgREST**, the same core approach used by Supabase. PostgREST dynamically exposes PostgreSQL tables, views and functions as REST resources, with PostgreSQL permissions and constraints determining the API behaviour. ([Supabase][1])

## Important terminology

What you described is an **automatically generated Data API**, not necessarily a Graph API.

Start with:

```text
REST Data API
```

Later add:

```text
GraphQL API
```

The first release should not include GraphQL. REST covers the immediate project-bootstrap requirement with substantially less development.

---

# 2. Primary Use Case

A developer starts the platform locally or on an internal server:

```bash
docker compose up
```

They then:

1. Create a project.
2. Open its SQL editor.
3. paste or upload database DDL.
4. Execute the SQL.
5. The system detects the new tables.
6. REST endpoints become available automatically.
7. The developer creates application users.
8. The frontend authenticates and receives a JWT.
9. The frontend calls generated APIs using the JWT.

Example:

```sql
create table tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    title text not null,
    completed boolean not null default false,
    created_at timestamptz not null default now()
);
```

Automatically available API:

```http
GET    /api/data/tasks
POST   /api/data/tasks
PATCH  /api/data/tasks?id=eq.<uuid>
DELETE /api/data/tasks?id=eq.<uuid>
```

Supabase follows this model: creating a table, view or function creates corresponding API routes, with standard CRUD operations handled through PostgREST. ([Supabase][2])

---

# 3. Recommended Initial Architecture

```text
                       ┌────────────────────────────┐
                       │      Developer Console     │
                       │                            │
                       │ SQL Editor                 │
                       │ Table/API Explorer         │
                       │ User Management            │
                       │ API Keys / Settings        │
                       └─────────────┬──────────────┘
                                     │
                              Admin API
                                     │
                       ┌─────────────▼──────────────┐
                       │   BaaS Control Service     │
                       │   NestJS or Quarkus        │
                       │                            │
                       │ Project Management         │
                       │ SQL Execution              │
                       │ Metadata Inspection        │
                       │ Auth Management            │
                       │ API Configuration          │
                       │ Audit Logging              │
                       └──────┬───────────┬─────────┘
                              │           │
                   Auth API   │           │ Database administration
                              │           │
                  ┌───────────▼───┐  ┌────▼──────────────────┐
                  │ Auth Module   │  │      PostgreSQL       │
                  │               │  │                       │
                  │ Users         │  │ platform schema       │
                  │ Sessions      │  │ auth schema           │
                  │ Passwords     │  │ project schemas       │
                  │ JWT issuance  │  │ application tables    │
                  └───────┬───────┘  └──────────┬────────────┘
                          │                     │
                          │ JWT                 │ Schema/permissions
                          │                     │
                  ┌───────▼─────────────────────▼──────┐
                  │              PostgREST             │
                  │                                    │
                  │ Automatically generated REST API   │
                  │ Filters, CRUD, joins, functions    │
                  └────────────────┬───────────────────┘
                                   │
                            Web/Mobile/Desktop UI
```

## Recommended stack

| Component                   | Recommendation                                 |
| --------------------------- | ---------------------------------------------- |
| Control service             | Node.js + TypeScript + NestJS                  |
| Alternative control service | Java 21 + Quarkus                              |
| Database                    | PostgreSQL                                     |
| Generated Data API          | PostgREST                                      |
| Authentication              | Initially custom module inside control service |
| Admin UI                    | Server-rendered HTML + lightweight JavaScript  |
| SQL editor                  | Monaco Editor or CodeMirror                    |
| Database migrations         | Flyway or Liquibase                            |
| Password hashing            | Argon2id                                       |
| Access tokens               | JWT signed using asymmetric keys               |
| Refresh tokens              | Random opaque tokens stored hashed             |
| Deployment                  | Docker Compose                                 |
| Reverse proxy               | Caddy, Nginx or Traefik                        |
| SDK                         | TypeScript package using Fetch API             |

For quickest delivery, I recommend:

```text
NestJS + PostgreSQL + PostgREST + server-rendered admin UI
```

Do not start with microservices. Use a modular monolith plus PostgREST as a separate runtime component.

---

# 4. Deployment and Project Isolation Model

There are three possible models.

## Model A: One deployment, one project

```text
One BaaS installation
One PostgreSQL database
One application project
```

This is the correct starting point.

Advantages:

* Simplest security model
* Simplest API configuration
* Easy Docker deployment
* No dynamic database provisioning
* Easy backup and restore
* Suitable for internal projects

## Model B: Multiple projects using PostgreSQL schemas

```text
One PostgreSQL instance
One database
One schema per project
```

Example:

```text
platform
auth
project_crm
project_inventory
project_booking
```

This can be added after the first version. PostgREST supports exposing multiple and dynamically configured schemas, but schema configuration and cache reloads must be managed carefully. ([PostgREST 14][3])

## Model C: One database per project

```text
One PostgreSQL server
Multiple databases
Separate PostgREST instance/configuration per project
```

This offers stronger isolation but introduces provisioning, connection management, backup and operational complexity.

## Recommendation

Implement the progression:

```text
Phase 1: One deployment = one project
Phase 2: Multiple projects using schemas
Phase 3: Optional dedicated database per project
```

Do not begin with multi-project database provisioning.

---

# 5. Initial Functional Scope

## 5.1 Platform administration

The platform has a separate administrator identity.

Capabilities:

* Sign in to the administration console
* Configure database connection
* Execute SQL
* View database objects
* View generated API information
* Manage application users
* Generate or rotate API keys
* View basic audit history

The platform administrator is different from users of the application being developed.

---

## 5.2 SQL editor

Initial functionality:

* Write SQL
* Paste SQL
* Upload `.sql` file
* Execute selected statement
* Execute entire script
* Display rows returned
* Display affected-row count
* Display errors with line and position
* Maintain execution history
* Download query results as CSV
* Limit query result rows
* Cancel long-running queries
* Show execution duration

### Security controls

The SQL editor must:

* Be accessible only to platform administrators
* Use a dedicated database administration connection
* Set statement timeout
* Set result-row limits
* Record who executed each statement
* Avoid logging passwords or secret values
* Require additional confirmation for dangerous operations later

For the initial internal version, allow unrestricted SQL for administrators. Trying to build a perfect SQL permission parser is unnecessary and unreliable.

---

## 5.3 Database object explorer

Read PostgreSQL catalog metadata and display:

* Schemas
* Tables
* Views
* Columns
* Primary keys
* Foreign keys
* Unique constraints
* Indexes
* Functions
* Enabled RLS status
* Policies
* API exposure status

The object explorer is read-only initially. All schema changes occur through SQL.

---

## 5.4 Automatic Data API

Expose selected PostgreSQL schemas through PostgREST.

Initial operations:

```http
GET     /rest/v1/{table}
POST    /rest/v1/{table}
PATCH   /rest/v1/{table}
DELETE  /rest/v1/{table}
POST    /rest/v1/rpc/{function}
```

Supported capabilities should come directly from PostgREST:

* Column selection
* Filtering
* Sorting
* Pagination
* Counts
* Insert
* Update
* Delete
* Upsert
* Foreign-key relationships
* Nested related records
* PostgreSQL functions as RPC endpoints

PostgREST can derive relationships from PostgreSQL metadata and expose related resources. ([Supabase][4])

Do not build a generic query engine inside NestJS or Quarkus. Your control service should configure and secure PostgREST, not duplicate it.

---

# 6. Authentication Scope

## Version 1 authentication features

Implement:

* Email/password registration
* Email/password login
* Logout
* Access token
* Refresh token
* Refresh-token rotation
* Current-user endpoint
* Change password
* Administrator-created users
* Enable/disable user
* Basic user metadata
* Session revocation
* Password reset token generation
* User listing and search

Defer actual outbound password-reset email until later. Initially, allow administrators to generate a reset link or set a temporary password.

## Do not initially include

* Social login
* SAML
* Enterprise SSO
* Phone OTP
* Magic links
* MFA
* Anonymous users
* Identity linking
* CAPTCHA
* Complex organization management

---

# 7. Authentication Data Model

Use a protected `auth` schema.

## Core tables

```text
auth.users
auth.identities
auth.sessions
auth.refresh_tokens
auth.password_reset_tokens
auth.audit_events
```

## Suggested `auth.users`

```text
id                  uuid primary key
email               citext unique not null
password_hash       text not null
status              active | disabled | invited
email_verified      boolean
role                text
user_metadata       jsonb
app_metadata        jsonb
created_at          timestamptz
updated_at          timestamptz
last_sign_in_at     timestamptz
password_changed_at timestamptz
```

## Suggested `auth.sessions`

```text
id                  uuid primary key
user_id             uuid
created_at          timestamptz
expires_at          timestamptz
revoked_at          timestamptz
ip_address          inet
user_agent          text
```

## Suggested `auth.refresh_tokens`

```text
id                  uuid primary key
session_id          uuid
token_hash          text
family_id           uuid
parent_token_id     uuid nullable
issued_at           timestamptz
expires_at          timestamptz
consumed_at         timestamptz nullable
revoked_at          timestamptz nullable
```

Never store refresh tokens in plaintext.

---

# 8. JWT Design

Use asymmetric signing:

```text
Ed25519 or RSA private key: Auth service only
Public key: PostgREST and client verification
```

Suggested claims:

```json
{
  "iss": "personal-baas",
  "aud": "authenticated",
  "sub": "user-uuid",
  "role": "authenticated",
  "email": "user@example.com",
  "session_id": "session-uuid",
  "iat": 1784000000,
  "exp": 1784000900
}
```

Use:

```text
Access-token lifetime: 15 minutes
Refresh-token lifetime: configurable, initially 30 days
```

JWT validation must include signature, expiry, issuer and audience validation. Service-level tokens must never be exposed to browser applications. ([Supabase][5])

---

# 9. PostgreSQL Roles and Authorization

Create these PostgreSQL roles:

```text
baas_admin
authenticator
anon
authenticated
service_role
```

## Responsibilities

### `baas_admin`

* Schema administration
* SQL editor execution
* Migration execution
* Never used by frontend applications

### `authenticator`

* Login role used by PostgREST
* Switches request context to `anon`, `authenticated` or another permitted role

### `anon`

* Unauthenticated API access
* No access unless explicitly granted

### `authenticated`

* Logged-in application users
* Access controlled through grants and RLS

### `service_role`

* Server-side trusted integrations
* Must never be exposed to frontend code

---

# 10. Row-Level Security

RLS is essential, even in the first usable release.

Example table:

```sql
create table api.tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    title text not null,
    completed boolean not null default false
);

alter table api.tasks enable row level security;
```

Example policy:

```sql
create policy tasks_owner_policy
on api.tasks
for all
to authenticated
using (
    user_id = current_setting('request.jwt.claim.sub', true)::uuid
)
with check (
    user_id = current_setting('request.jwt.claim.sub', true)::uuid
);
```

The generated API is safe only when PostgreSQL privileges and RLS policies are correctly configured. Supabase similarly recommends explicit grants and enabling RLS on objects exposed through its Data API. ([Supabase][6])

## Initial usability helper

Provide reusable SQL snippets:

```text
Enable authenticated read
Enable authenticated CRUD
Owner-only access using user_id
Public read, authenticated write
Admin-only access
```

Do not build a visual RLS policy designer initially.

---

# 11. Schema Change Detection

PostgREST maintains a schema cache. When DDL changes tables, views, functions or relationships, its cache must be reloaded. ([PostgREST 14][7])

Use two mechanisms.

## Immediate mechanism

After successful SQL execution through the console:

1. Detect whether the SQL may contain DDL.
2. Send PostgREST schema reload notification.
3. Refresh object metadata.
4. Show the generated endpoints.

## Reliable mechanism

Install a PostgreSQL event trigger for:

```text
ddl_command_end
sql_drop
```

PostgreSQL event triggers operate at database level and can capture DDL operations. ([PostgreSQL][8])

The trigger can issue:

```sql
notify pgrst, 'reload schema';
notify baas_schema_change, '{"type":"ddl"}';
```

The control service listens for `baas_schema_change` and refreshes its metadata cache.

---

# 12. API Exposure Model

Do not expose every schema.

Use:

```text
platform    Internal platform data
auth        Authentication data
api         Application tables exposed through REST
private     Internal application tables
```

Only expose:

```text
api
```

Example:

```sql
create schema api;
create schema private;
```

This establishes an important convention:

```text
api.*       Automatically exposed
private.*   Never directly exposed
auth.*      Never directly exposed
platform.*  Never directly exposed
```

Views and functions in `api` can safely expose controlled operations over private tables.

---

# 13. Public API Structure

```text
/auth/v1/signup
/auth/v1/login
/auth/v1/logout
/auth/v1/token
/auth/v1/user
/auth/v1/password
/auth/v1/reset-password

/rest/v1/{table}
/rest/v1/rpc/{function}

/admin/v1/sql/execute
/admin/v1/database/objects
/admin/v1/users
/admin/v1/settings
/admin/v1/api-keys
```

Use the reverse proxy to present one consistent endpoint:

```text
http://localhost:8000
```

Routing:

```text
/auth/*   → Control service
/admin/*  → Control service
/rest/*   → PostgREST
```

---

# 14. API Keys

Initially support two keys.

## Publishable key

Used from frontend applications:

```text
Role: anon
Can be placed in browser applications
Actual access still governed by RLS
```

## Secret service key

Used by backend applications:

```text
Role: service_role
Never exposed in frontend code
```

Store API keys hashed in the database where lookup permits, or sign them as JWT-based keys. Keep the initial implementation simple: use long-lived signed JWT keys with a key identifier and rotation support.

---

# 15. JavaScript SDK Scope

Build a small SDK after HTTP APIs stabilize.

Example:

```typescript
const client = createClient({
  url: "http://localhost:8000",
  apiKey: "publishable-key"
});

const session = await client.auth.signIn({
  email: "user@example.com",
  password: "password"
});

const result = await client
  .from("tasks")
  .select("*")
  .eq("completed", false)
  .order("created_at", "desc")
  .limit(20);
```

Initial SDK modules:

```text
client.auth
client.from(table)
client.rpc(functionName)
```

Initial query builder:

```text
select
insert
update
delete
upsert
eq
neq
gt
gte
lt
lte
like
ilike
in
is
order
limit
range
single
maybeSingle
```

Do not attempt full Supabase SDK compatibility. Create a smaller, documented interface influenced by it.

---

# 16. Explicit Version-1 Boundaries

## Included

* Single project deployment
* PostgreSQL
* SQL editor
* SQL script upload
* Database explorer
* Automatic REST APIs
* Tables, views and PostgreSQL functions
* Email/password authentication
* JWT and refresh tokens
* User administration
* PostgreSQL roles
* RLS support
* Publishable and secret keys
* API documentation/examples
* TypeScript SDK
* Docker Compose deployment
* Basic audit log

## Excluded

* GraphQL
* Edge/serverless functions
* Social authentication
* MFA
* Email delivery infrastructure
* Visual table designer
* Visual RLS policy designer
* Database branching
* Point-in-time recovery
* Multi-region deployment
* Database connection pooling platform
* Monitoring platform
* Marketplace/extensions
* Billing and subscriptions
* Cloud-hosted control plane
* Automatic TypeScript generation in the first release
* Multi-project isolation in the first release

This boundary is important. Otherwise, the project quickly becomes a Supabase clone rather than a useful internal accelerator.

Storage and Realtime subscriptions, originally excluded here and listed under §18 Later Roadmap, have since been promoted to real phases (§17 Phase 7 and Phase 8) — see §21 and §22 for their models. Multi-project support, originally listed under §18 Later Roadmap as "Expansion 1," has likewise been promoted to a real phase (§17 Phase 9) — see §23 for its model. GraphQL remains excluded.

Edge/serverless functions, also originally excluded, are promoted to a real phase (§17 Phase 12) now that Phase 9's multi-project model exists to scope functions to — see §26. Static hosting and a job scheduler were not part of the original exclusion list at all; they're new, later additions covered by §25 and §27. Separately, storage's per-project isolation is being retrofitted in §17 Phase 10 to close a gap Phase 7 shipped before Phase 9's project model existed — see §24. A secrets vault (Phase 16) was likewise never part of the original exclusion list — it's a new, later addition covered by §30, added once Functions (§26) existed for it to serve as a runtime credential store for.

Five more items, driven by concrete downstream-project demand rather than speculative roadmap planning, have likewise since been promoted to real phases: **rate limiting / brute-force protection** (§18 Expansion 7 → §17 Phase 17, §31), **outbound email via Resend** (§18 Expansion 8 → §17 Phase 18, §32), **MFA** (§18 Expansion 6 → §17 Phase 19, §33), **PDF generation via a vendor-agnostic external API** (§18 Expansion 9 → §17 Phase 20, §34), and an **AI Gateway** (§18 Expansion 10 → §17 Phase 21, §35, the largest of the five). See §31–§35 for their full designs (schema, endpoints, acceptance criteria), in the style of §21–§30.

---

# 17. Development Phases

## Phase 0 — Repository and runtime foundation

### Deliverables

* Monorepo
* Docker Compose
* PostgreSQL
* PostgREST
* Control service
* Admin web application
* Reverse proxy
* Database migration mechanism
* Development configuration
* Health endpoints
* Structured logging

Suggested structure:

```text
personal-baas/
├── apps/
│   ├── control-server/
│   └── admin-web/
├── packages/
│   ├── client-sdk/
│   ├── shared-types/
│   └── database-bootstrap/
├── infrastructure/
│   ├── docker/
│   ├── postgres/
│   ├── postgrest/
│   └── proxy/
├── migrations/
├── examples/
└── docs/
```

### Acceptance condition

```bash
docker compose up
```

starts PostgreSQL, PostgREST and the control application successfully.

---

## Phase 1 — SQL editor and database explorer

### Features

* Platform administrator login
* SQL editor
* Execute SQL
* SQL file upload
* Results table
* Error reporting
* Execution history
* Schema/table/column browser
* Metadata refresh
* Query timeout
* Result limit

### Acceptance scenario

1. Start platform.
2. Open admin console.
3. Execute `CREATE TABLE`.
4. Table appears in the object explorer.
5. Execute insert and select statements.
6. Results are displayed.

At this phase, authentication can apply only to the administration console.

---

## Phase 2 — Automatic REST Data API

### Features

* Configure PostgREST
* Expose only the `api` schema
* Automatic CRUD
* Filters
* Sorting
* Pagination
* Upsert
* Views
* PostgreSQL functions as RPC
* Foreign-key relationship querying
* Schema-cache reload
* API explorer
* Generated cURL examples
* OpenAPI endpoint

### Acceptance scenario

After:

```sql
create table api.tasks (...);
```

the developer can immediately call:

```http
GET /rest/v1/tasks
POST /rest/v1/tasks
```

No code generation, restart or custom controller is required.

---

## Phase 3 — Application authentication

### Features

* Application user model
* Sign-up
* Sign-in
* Logout
* Access token
* Refresh token rotation
* Current-user endpoint
* Change password
* Disable user
* Revoke sessions
* Administrator user management
* Auth audit events

### Acceptance scenario

1. Register a user.
2. Log in.
3. Receive access and refresh tokens.
4. Call `/rest/v1/tasks` using the JWT.
5. Refresh the access token.
6. Revoke the session.
7. Confirm that further refresh attempts fail.

---

## Phase 4 — Database authorization and RLS integration

### Features

* `anon`, `authenticated` and `service_role`
* JWT role mapping
* Request JWT claims available inside PostgreSQL
* RLS templates
* Permission validation
* Warning for exposed tables without RLS
* API-key management
* Service-role access

### Acceptance scenario

Two users create task records. Each user can see only their own records through the same `/rest/v1/tasks` endpoint.

This phase makes the product genuinely useful for frontend integration.

---

## Phase 5 — Developer experience

### Features

* TypeScript SDK
* Authentication persistence
* Automatic token refresh
* Fluent data-query builder
* ~~API explorer / copyable JavaScript examples~~ — deferred, see below
* Copyable cURL examples
* Project environment file generation
* Installation and deployment guide

(The sample application originally planned here was built ahead of schedule as Phase 7a's example todo app — directly against REST/Auth/Storage, since it also needed to demonstrate Storage.)

The user narrowed this phase's build to 5 of the original 7 items: the SDK itself (auth,
query builder, RPC, storage), its build/packaging, the env-file generator, and docs (install
guide + an upgrade runbook folded in from Phase 6b). The API-explorer copyable-JS-SDK-snippets
item stays deferred, same narrowing pattern as Phases 6/6b/7. Env-file generation resolves a
real design constraint rather than a preference: secret/service_role API keys are one-time-reveal
by design (never stored server-side, see §6/Phase 4.4), so the "Generate .env" admin action always
mints a **new** secret key at generation time rather than trying to surface an existing one's
plaintext — existing keys are left untouched. `BAAS_URL` in the generated file defaults to the
admin UI's own `window.location.origin` (it's served through the same public Caddy entry point),
so no new backend `PUBLIC_DOMAIN` plumbing is needed.

Example generated configuration:

```env
BAAS_URL=http://localhost:8000
BAAS_PUBLISHABLE_KEY=...
BAAS_SERVICE_KEY=...
```

### Acceptance scenario

A new HTML or React application can authenticate and perform CRUD without writing backend code.

---

## Phase 6 — Operational hardening

### Features

* TLS support
* Password-reset workflow
* Security headers
* Metrics
* Container health checks
* Secrets through environment or mounted files

## Phase 7 — Storage

### Features

* S3-compatible object storage via a self-hosted MinIO service
* Buckets (logical, prefix-based — see §21)
* Signed URLs for direct upload/download
* Per-bucket public/private access
* Object metadata tables in a new `storage` schema

See §21 Storage Model for the full design.

## Phase 7a — Example Todo App

### Features

* Standalone reference client under `examples/todo-app/` — plain HTML/CSS/jQuery, zero build step
* Exercises Auth (register/login), REST (todo CRUD via RLS-scoped `api.todos`), and Storage (attachment upload/download/delete) end-to-end, entirely over the public HTTP API
* Copy-paste deployable: only `js/config.js` (BaaS URL + publishable key) needs editing after copying the directory elsewhere
* Supersedes the Phase 5 "Sample application" deliverable — see §17 Phase 5

Runs after Phase 7 (depends on Storage for attachments), before Phase 8. See `docs/implementation-plan.md` for the full breakdown.

## Phase 8 — Realtime (optional)

### Features

* Table subscriptions over a WebSocket gateway
* Trigger + `LISTEN`/`NOTIFY` event delivery (not logical replication — see §22)
* Coarse subscription authorization (table grant + optional equality filter)

Lower priority than Phase 7; see §22 Realtime Model for the full design and the rationale for deferring full logical replication.

## Phase 9 — Multi-project support

### Features

* Multiple projects on one shared PostgreSQL instance, each with a dedicated `api_<slug>` schema
* Project-scoped PostgreSQL roles (`anon_<slug>`, `authenticated_<slug>`, `service_role_<slug>`) —
  Postgres-grant-enforced isolation, not RLS discipline alone
* Per-project `auth.users` / `platform.api_keys` (project-scoped user pools and API keys)
* JWTs carrying a `project_id` claim and a project-scoped `role` claim
* Admin seeding requires at least one project to already exist

See §23 Multi-Project Model for the full design.

## Phase 6b — Operational hardening (deferred)

### Features

* Key rotation
* Backup and restore commands
* Database connection limits
* Request body limits
* API rate limiting
* Brute-force login protection
* Audit exports
* Upgrade procedure

Deferred behind Phases 7 and 8 at the user's direction — not dropped, just resequenced.

This produces the first internally production-usable release.

---

## Phase 10 — Project-scoped storage (retrofit)

### Features

* `project_id` added to `storage.buckets`; bucket names become unique per project, not globally
* Admin console storage page gains a required project selector, matching every other admin page since Phase 9
* Existing single-project storage data backfilled to the default project

Closes an authorization gap in already-shipped code — Phase 7 storage predates Phase 9's project model, so a valid JWT from any project can currently read/write/delete any other project's bucket by name. See §24 Project-Scoped Storage Model for the full design.

## Phase 11 — Static hosting

### Features

* Path-based per-project static site hosting at `/sites/<slug>/*`, same-origin with that project's own APIs
* Zip-based, full-replace deploy via the admin console — no build step, no custom domains, no previews
* SPA `index.html` fallback for extensionless paths

See §25 Static Hosting Model for the full design.

## Phase 12 — Functions

### Features

* HTTP-invoked, project-scoped JavaScript/TypeScript functions
* `ctx.rest`-mediated data access — a function can't do anything its invoking caller couldn't already do via `/rest/v1/*`
* Executed in a separate `function-runner` sibling process (fresh `worker_thread` per invocation) — a rogue or crashing function cannot take down control-server
* Cross-project invocation is structurally impossible: control-server resolves `(project_id, name)` before the runner is ever contacted, and the runner holds no DB credential to look anything up itself

See §26 Functions Model for the full design.

## Phase 13 — Scheduler

### Features

* Cron-scheduled invocation of Phase 12 functions, run with `service_role`-level trust
* In-process timer loop — no OS cron, no `pg_cron`, no new sibling service
* Single-instance limitation, same caveat shape as Phase 8 Realtime's

Depends on Phase 12 — a scheduled job's unit of work is a function invocation, not a separate execution primitive. See §27 Scheduler Model for the full design.

## Phase 17 — Rate limiting & brute-force protection

### Features

* `@nestjs/throttler` global guard across all control-server routes, in-memory store
* Stricter per-route throttling on `/auth/v1/login`, `/auth/v1/signup`, and `/auth/v1/mfa/verify`
* Persistent login-lockout tracking per email via `auth.audit_events`, independent of raw request-rate throttling

Closes the still-open Phase 6b items. Promoted from §18 Expansion 7. See §31 Rate Limiting Model for the full design.

## Phase 18 — Outbound email

### Features

* Provider-agnostic `EmailProvider` interface with two adapters in v1: Resend (REST API) and generic SMTP (`nodemailer`)
* Per-project provider configuration (`email.provider_configs`), secret stored in that project's own Secrets Vault — same shape as the AI Gateway (§35)
* `email.sent_messages` audit table
* Self-service `/auth/v1/password-reset/request` — the password-reset email deferred since §6
* `ctx.email.send()` Functions capability, reusing the internal-callback mechanism built for Vault (§30)

Promoted from §18 Expansion 8, reshaped 2026-09-12 from a platform-level Resend-only design to provider-agnostic and per-project. See §32 Outbound Email Model for the full design.

## Phase 19 — Multi-Factor Authentication

### Features

* Project-level `mfa_required` toggle (`platform.projects`), default **off** — admin-controlled, not user-opt-in only
* TOTP (RFC 6238) enrollment + backup codes, encrypted at rest with the same libsodium primitive as the Secrets Vault (§30)
* Three-way `/auth/v1/login` handshake: normal tokens, pending-verify, or (new) pending-enrollment when the project requires MFA and the user has no factor yet
* Voluntary self-service enrollment still works even when the project doesn't require it
* Admin-triggered MFA reset for lockout recovery

Lives in the Auth module itself, not Functions. Promoted from §18 Expansion 6, reshaped 2026-09-12 to make the project-level policy a core v1 requirement rather than a deferred fast-follow. See §33 MFA Model for the full design.

## Phase 20 — PDF generation

### Features

* Vendor-agnostic `PdfProvider` interface; a config-driven `GenericHttpPdfProvider` covers three common hosted-API response shapes, plus a `MockPdfProvider` for v1 acceptance testing
* `ctx.pdf.render()` / `ctx.pdf.renderToStorage()` Functions capabilities, via the same internal-callback mechanism as Vault/Email
* `pdf.render_requests` audit table

No concrete vendor is selected or wired by default — wiring one in later is pure env configuration. Promoted from §18 Expansion 9. See §34 PDF Generation Model for the full design.

## Phase 21 — AI Gateway

### Features

* Provider-agnostic `AiProvider` interface with two real adapters (Anthropic, OpenAI) in v1
* Per-project provider/model configuration (`ai.provider_configs`), API key stored in that project's own Secrets Vault
* `POST /ai/v1/complete` REST surface and `ctx.ai.complete()` Functions capability
* Stored, editable prompt templates; JSON-Schema structured-output validation; per-request token/cost metering (`ai.requests`)

The largest of the five. Promoted from §18 Expansion 10. See §35 AI Gateway Model for the full design.

---

# 18. Later Roadmap

After the initial product is stable, add features in this order:

## Expansion 1: Multi-project support (promoted — see §17 Phase 9 and §23)

* Project creation
* One schema per project
* Project-specific URL and keys
* Per-project user pools or shared identity strategy
* Schema lifecycle
* Project backup and deletion

## Expansion 2: Schema management UI

* Create/alter/drop tables
* Column management
* Foreign keys
* Indexes
* SQL preview before execution
* Migration history

## Expansion 3: Generated types

* TypeScript types from PostgreSQL metadata
* Downloadable SDK configuration
* Schema-specific client generation

## Expansion 4: Authentication improvements

* Email verification
* Magic links
* Social providers
* MFA — **prioritized out of this generic bucket, see Expansion 6**
* Organizations and memberships
* Custom JWT claims

## Expansion 5: GraphQL

* Add a GraphQL layer using an existing PostgreSQL-aware engine
* Do not implement GraphQL schema generation manually

## Expansion 6: Multi-Factor Authentication (promoted — see §17 Phase 19 and §33)

Driven by downstream project demand — several applications built on this platform require MFA
and it is currently a hard "no" (§6, §16). Detailed design to follow separately, but the shape is
already clear enough to commit to:

* TOTP (RFC 6238) + backup/recovery codes as the v1 factor — no SMS, no WebAuthn/passkeys yet,
  consistent with this platform's "start simple" posture elsewhere.
* Lives in the **Auth module itself**, not Functions — MFA is part of the login handshake
  (`/auth/v1/login` returns a pending-MFA state instead of tokens when enabled; a second
  `/auth/v1/mfa/verify` call issues the real access/refresh pair), which a project-scoped,
  post-authentication Function has no way to intercept.
* New `auth.mfa_factors` / `auth.mfa_backup_codes` tables; secrets encrypted at rest reusing the
  libsodium primitive already vendored for the Secrets Vault (§30), not a new crypto dependency.
* Per-user optional enrollment in v1; an org/project-level "MFA required" policy toggle is a
  natural fast-follow once enrollment itself works.
* Admin console gains an admin-triggered "reset this user's MFA" action for lockout recovery —
  same trust level as existing admin user-management actions (§5.1).

Comparable effort to a full phase (Storage- or Functions-sized), not a small patch — mainly
because it touches the login state machine and session issuance, not just a new table.

## Expansion 7: Rate Limiting & Brute-Force Protection (promoted — see §17 Phase 17 and §31)

Closes the still-open Phase 6b items (rate limiting, brute-force login protection — scope.md
§17 Phase 6b). Lower effort than it looks:

* `@nestjs/throttler` (official NestJS package) as a global guard, with a stricter per-route
  override on `/auth/v1/login` and `/auth/v1/signup` specifically.
* In-memory store is sufficient given this platform's already-established single-instance
  deployment assumption (the same caveat already accepted for Realtime §22 and Scheduler §27) —
  no Redis needed unless that assumption changes.
* One of the lowest-effort items on this whole roadmap; mainly configuration, not new
  architecture.

## Expansion 8: Outbound Email (promoted — see §17 Phase 18 and §32)

Email delivery infrastructure was explicitly excluded from v1 (§16) — downstream projects need
it for password-reset (the originally-deferred flow from §6/Phase 6) and their own transactional
notifications.

* Backed by the **Resend** API — a new module wraps it, not a self-hosted MTA.
* Platform-level credential (env-configured, same convention as `AUTH_JWT_PRIVATE_KEY_BASE64`/
  `VAULT_MASTER_KEY_BASE64`), not a per-project Vault secret, since sending capability is a
  shared platform service, not project-owned data.
* Exposes a new `ctx.email.send()` capability to Functions (mirrors `ctx.rest`/`ctx.secrets`),
  plus finally implements the platform's own long-deferred password-reset email.
* Sending logged to a new `email.sent_messages` table, same audit-table convention as
  `functions.invocations`/`scheduler.job_runs`.

## Expansion 9: PDF Generation (promoted — see §17 Phase 20 and §34)

Never part of the original scope at all — new demand from downstream projects needing
client-facing PDF reports/documents.

* Backed by an external HTML→PDF API (same "wrap a hosted API, don't self-host a renderer"
  shape as Expansion 8's email choice) rather than running headless Chrome or a rendering
  engine as a sibling service.
* Exposes a `ctx.pdf.render(html)` capability to Functions, returning bytes that land in
  Storage (§21) through the existing storage-write path rather than a new delivery mechanism.
* Needs its own size/timeout caps, same `*_MAX_*_BYTES`-style env convention already used for
  uploads (§21 point 6) and hosting deploys (§25 point 3).

## Expansion 10: AI Gateway (promoted — see §17 Phase 21 and §35)

The most substantial of the newly-queued items — genuinely new architectural surface, not a
thin API wrapper like Expansions 8/9.

* **Native control-server module, not a user-authored Function.** Functions can't hold
  provider credentials safely without a per-call Vault round-trip anyway, can't `npm install`
  a provider SDK or a schema-validation library (single-file, no-dependency execution per §26
  point 2), and the cross-cutting concerns below are exactly the kind of thing this platform
  already centralizes once rather than reimplementing per project (compare Storage, Vault).
* Provider abstraction (start with one provider, architect for more), prompt/template
  versioning (stored, not hardcoded in Function source), structured-output validation,
  retries/timeouts, and per-request cost/token metering logged to a new `ai.requests` table —
  same audit convention as every other subsystem here.
* Two surfaces: a direct project-scoped `POST /ai/v1/*` REST endpoint (for simple frontend-only
  copilot calls, `AccessTokenGuard`-protected like Storage/Functions) **and** a `ctx.ai`
  capability inside Functions (for orchestration that needs both AI and `ctx.rest` project data
  in the same call).
* A feature-flag/policy layer per project (which AI capabilities are enabled) falls out
  naturally from this module's own config table — useful for any downstream project with its
  own regulatory constraints on AI-assisted decisions.

Comparable in scope to Functions (§26) itself, likely larger once streaming responses and cost
metering are designed in detail — budget accordingly. Full design deferred to a separate pass,
same as the other Expansions above.

---

# 19. Core Architectural Decisions to Freeze

Codex should work against these fixed decisions:

```text
1. PostgreSQL is the source of truth.

2. PostgREST provides the generated Data API.

3. The control service does not create CRUD controllers for application tables.

4. Only the api schema is exposed.

5. Authentication data stays in the protected auth schema.

6. Authorization is enforced primarily through PostgreSQL roles, grants and RLS.

7. The first release supports one project per deployment.

8. All schema modifications initially happen through SQL.

9. The administration application is a modular monolith.

10. REST comes before GraphQL.

11. HTTP APIs are stabilized before building the SDK.

12. Supabase compatibility is not a requirement.
```

---

# 20. Recommended First Usable Milestone

The first meaningful milestone should contain only:

```text
Docker Compose
PostgreSQL
PostgREST
NestJS control server
Admin authentication
SQL editor
Database explorer
Automatic REST API
Application email/password authentication
JWT integration
Basic RLS
JavaScript usage examples
```

A developer should be able to:

```text
Start the platform
→ paste schema SQL
→ create a user
→ obtain a JWT
→ call generated CRUD APIs
→ integrate those APIs into a frontend
```

That is the correct product core. Everything else—GraphQL, visual schema editing, social authentication, and (optionally) realtime—should be treated as later platform extensions. Storage is now planned as Phase 7 (§21), since most applications built on this platform will need it.

---

# 21. Storage Model

Phase 7. Object storage backed by a self-hosted [MinIO][9] instance (S3-compatible), fronted entirely by the control service — clients never talk to MinIO or hold MinIO credentials directly.

```text
1. One real MinIO bucket for the whole deployment (e.g. baas-storage).

2. Logical "buckets" (as developers create them, e.g. "avatars", "documents")
   are not real MinIO buckets — they are key prefixes, tracked in a new
   storage.buckets metadata table (id, name, public boolean, size_limit_bytes,
   created_at).

3. Every uploaded object is tracked in storage.objects (id, bucket_id, path,
   owner user id, size, content_type, created_at) — the metadata table is the
   source of truth for access decisions; MinIO only stores bytes.

4. Access is enforced in the control service, not in MinIO: owner-based
   read/write, plus a public-read flag per logical bucket. This mirrors the
   RLS philosophy (row-level ownership checks) but is implemented in
   application code, since MinIO itself has no row-level concept.

5. Signed URLs: the control service can issue a short-lived presigned MinIO
   URL for direct upload/download, permission-checked once at signing time,
   letting large transfers bypass the control service's own bandwidth.

6. Per-upload size limits are enforced by the control service before
   streaming to MinIO.
```

This is a v1 design for Phase 7, not a frozen architectural decision — it may be revisited if usage patterns (e.g. a need for true per-bucket MinIO lifecycle policies) justify the added complexity of real per-bucket MinIO buckets.

---

# 22. Realtime Model (optional)

Phase 8, explicitly lower priority than Phase 7. Table subscriptions delivered over a WebSocket gateway.

```text
1. Event source: ordinary PostgreSQL triggers (AFTER INSERT OR UPDATE OR
   DELETE) call a NOTIFY on a dedicated channel with a small JSON payload —
   the same LISTEN/NOTIFY primitive already used for PostgREST schema-reload
   (§11), not PostgreSQL logical replication. This avoids a new PostgreSQL
   role, a wal_level=logical config change, and replication-slot lifecycle
   management, at the cost of at-most-once delivery (a disconnected client
   misses events, same trade-off Supabase's own Broadcast feature makes).

2. The control service holds one persistent LISTEN connection and fans
   events out to subscribed WebSocket clients.

3. Authorization is coarse, not a full per-event RLS re-evaluation: a client
   may subscribe to a table only if their role already has REST SELECT
   access to it, plus an optional equality filter (e.g. user_id=eq.<uuid>)
   matched against each event's row data before delivery.

4. GraphQL is not required for this and is not used — PostgREST cannot
   support subscriptions itself (stateless HTTP only), so realtime always
   needs a sibling service regardless of transport; a plain WebSocket
   channel carrying JSON is the natural choice given GraphQL is not part of
   this platform (§19 decision 10).

5. Future upgrade path (not v1): full PostgreSQL logical replication
   (pgoutput) for durable, ordered delivery via a replication slot, if
   at-most-once delivery ever proves insufficient. Not required for the
   initial release given this feature's optional/lower-priority status.
```

---

# 23. Multi-Project Model

Phase 9. One shared PostgreSQL instance hosts multiple projects, each with genuinely isolated
data and users — not just multiple `api` tables sharing one identity pool. The platform is
operated by a single administrator who manages all projects; isolation is a boundary between
projects' REST APIs and JWTs, not a boundary within the admin console.

```text
1. Schema per project. platform.projects (id, slug, name, created_at, updated_at).
   Each project owns a Postgres schema api_<slug>, created at project-creation time
   (not at container bootstrap, since projects are created after the platform is
   already running).

2. Postgres-role-enforced isolation, not RLS discipline alone. A shared
   `authenticated` role across all projects would mean any validly-signed JWT could
   read/write any project's schema that happens to grant `authenticated` access —
   RLS alone cannot prevent this if a single table forgets a project_id check, and
   a human (the same admin, writing SQL by hand per project) will eventually forget.
   So each project gets its own three roles, mirroring the existing global ones:

       anon_<slug>            NOLOGIN
       authenticated_<slug>   NOLOGIN
       service_role_<slug>    NOLOGIN BYPASSRLS

   All three are granted to `authenticator` (same role-switching mechanism already
   used for the global anon/authenticated/service_role). A project-A JWT's `role`
   claim becomes `authenticated_<slug-a>`, which structurally cannot access project
   B's schema regardless of whether project B's RLS policies are correct — isolation
   is enforced by Postgres grants, the same mechanism §9/§10 already trust for the
   single-project case.

3. auth.users and platform.api_keys gain project_id. User uniqueness becomes
   (project_id, lower(email)) instead of a single global unique email. API keys
   (publishable/secret) are minted per project, each carrying that project's
   anon_<slug> or service_role_<slug> in its signed role claim.

4. JWTs gain a project_id claim, and their role claim becomes the project-scoped
   variant (authenticated_<slug>, anon_<slug>, or service_role_<slug>) instead of
   the flat global name.

5. Project resolution on auth endpoints reuses an existing convention instead of
   introducing a new header. Client applications already send
   `Authorization: Bearer <publishable-key-JWT>` before login (per the reference
   todo-app client). Signup/login/token endpoints verify that pre-login bearer as
   an API-key JWT, resolve project_id from platform.api_keys, and scope the
   auth.users lookup/creation to it. No separate `apikey` header is introduced.

6. Admin seeding requires a project to already exist. On first boot, a
   ProjectsService.ensureDefaultProject() step (idempotent, env-driven —
   INITIAL_PROJECT_SLUG / INITIAL_PROJECT_NAME, same pattern as
   INITIAL_ADMIN_EMAIL/PASSWORD) runs before platform.platform_admins seeding.
   An admin identity is never seeded without at least one project present.

7. PostgREST reconfiguration on new-project creation is a manual step, not
   automated. PostgREST only picks up its exposed schema list (db-schemas) on
   process restart / config reload — there is no way to add a schema to a running
   instance's exposed list via NOTIFY alone. Automating this would mean giving
   control-server Docker-socket access to restart the postgrest container, a
   materially larger attack surface than anything else in the stack; this was
   considered and explicitly rejected. Instead, postgrest.conf becomes a mounted,
   writable file (rather than env-var-only config) that control-server rewrites
   (the db-schemas line) on project create/delete, and the admin console surfaces
   a copyable `docker compose restart postgrest` reminder — a human triggers the
   reload, control-server only prepares the config change.

8. The platform administrator is not project-scoped. One admin identity manages
   every project (per §5.1, unchanged); the admin console gains a project selector
   for the SQL console, database explorer, and API-key pages, but this is a
   convenience for the single admin, not an isolation boundary — the actual
   isolation boundary for tenant data is the REST API / JWT / Postgres-role layer
   described above.
```

This is a v1 design for Phase 9, not a frozen architectural decision — the manual
PostgREST-restart step in particular may be revisited (e.g. a `SIGUSR1`-driven config
hot-reload instead of a full container restart) if the operational friction proves
worse in practice than the added attack surface of automating it.

---

# 24. Project-Scoped Storage Model (retrofit)

Phase 10. Closes a gap Phase 7 (§21) shipped before Phase 9 (§23) introduced multi-project
support: `storage.buckets`/`storage.objects` currently have no `project_id` at all, bucket
names are globally unique, and `StorageRequester` carries no project context — meaning any
project's valid JWT can currently read/write/delete any other project's bucket by name. This
is an authorization gap in already-shipped code, not a new feature; treat it with the same
priority as a bug fix.

```text
1. storage.buckets gains project_id uuid not null references platform.projects(id).
   The existing unique index on `name` is dropped and replaced with a composite
   unique index on (project_id, name) — bucket names become unique per project,
   not globally. storage.objects needs no direct project_id column: its bucket_id
   foreign key already pins it to exactly one project transitively.

2. Migration path for existing data: same "backfill before NOT NULL" pattern as
   Phase 9 point 3 (auth.users/platform.api_keys) — add the column nullable,
   backfill every existing row (Phase 7's single-project dev data, e.g. the
   examples/todo-app's todo-attachments bucket) to the default project's id, then
   apply the NOT NULL constraint.

3. StorageRequester gains a projectId field on both variants. For app-user
   requests this comes from the caller's own JWT projectId claim
   (AppAccessTokenClaims already carries this since Phase 9 point 4 — no new
   claim needed). For admin requests, the admin console's existing
   project-selector convention applies: every /admin/v1/storage/* route gains a
   required :project path segment, mirroring the selector Phase 9 point 7 added
   to the SQL console/DB explorer/API-keys pages — storage predates that change
   and never got one.

4. Bucket lookup moves from name alone to (projectId, name). A project-B JWT
   requesting bucket "avatars" that only exists in project A gets a 404, not a
   403 — the same "doesn't leak existence across the isolation boundary"
   property RLS-based isolation gives elsewhere on this platform.

5. No MinIO-level change needed. Object keys are already namespaced by the
   bucket's own UUID, so cross-project physical key collisions were never
   possible — this was always a Postgres/application-authorization gap, not a
   storage-backend one, consistent with §21 point 4 (MinIO holds bytes; the
   metadata tables are the access-decision source of truth).

6. Optional: auto-provision one default bucket per project at project-creation
   time, named after the project slug, private by default. This matches "during
   project create we create this bucket," but should ship as an opt-in the admin
   can decline per project, not a forced side effect — Phase 7a's todo-app
   instead created its bucket manually post-creation via the admin UI, and that
   manual path must keep working regardless of this default.

7. Note on "RLS" framing: storage authorization has never been Postgres RLS —
   §21 point 4 is explicit that access is enforced in application code, not in
   MinIO or via Postgres row policies, since MinIO has no row-level concept.
   This phase gives storage the same *isolation guarantee* RLS gives api.*
   tables (a project boundary a single forgotten check can't cross), but via
   the same Postgres-role-grant-style project scoping §23 point 2 already uses
   for schemas — not by introducing real RLS policies into a storage table.
```

**Acceptance**: two projects, each with a same-named private bucket ("avatars") and a distinct
real signed-up/logged-in user; project A's JWT gets 404 against project B's identically-named
bucket and vice versa; the admin storage page requires a project selection before listing or
creating buckets.

---

# 25. Static Hosting Model

Phase 11. Path-based static site hosting per project — a developer builds a client-side app
(plain HTML/JS, or a bundled SPA's build output) and deploys it to be served directly by the
platform, same-origin with that project's REST/Auth/Storage/Functions APIs.

```text
1. Routing: path-based, not subdomain-based — GET /sites/<project-slug>/*path on
   the existing single Caddy entry point (:8000/:443), reusing the exact
   `handle /sites/*` -> control-server pattern already used for /storage/*. No
   wildcard DNS or wildcard TLS cert needed — and, the useful side effect of
   choosing path-based, a hosted site calling /rest/v1/*, /auth/v1/*,
   /storage/v1/*, /functions/v1/* on the same origin needs no CORS
   configuration at all, since browser same-origin rules are satisfied by
   construction. Subdomain-based routing is the closer analogue to Vercel's
   actual UX but was declined for this reason plus the wildcard-cert
   operational cost; revisitable later, same as §21 flags its own MinIO
   architecture as revisitable.

2. Storage: reuses MinIO — no new storage subsystem — via a new `hosting`
   schema. hosting.sites (id, project_id unique, created_at, updated_at): one
   active deployment per project in v1, not a history of named
   environments/previews. hosting.site_files (id, site_id, path, size,
   content_type, deployed_at), unique(site_id, path). Physical MinIO key:
   hosting/<project_id>/<path>, same UUID-namespacing pattern §21/§24 already
   use to avoid cross-project key collisions at the storage-backend level.

3. Deploy: POST /admin/v1/hosting/:project/deploy, admin-authenticated
   (AdminSessionGuard — same trust level as the SQL console; v1 has no
   service_role/CI-token deploy path, though that's an obvious later
   addition), multipart .zip upload. Control-server unzips server-side and
   does a full replace of that project's hosting.site_files, not an
   incremental diff — simplest correct behavior for a v1 "deploy" action.
   Enforce a total-uncompressed-size cap and a max-file-count cap, same
   STORAGE_MAX_UPLOAD_BYTES-style env-configurable convention as Phase 7
   point 5.

4. Serve: GET /sites/:project/*path (public, unauthenticated by design — a
   browser loads this with no token) resolves the project by slug, looks up
   hosting.site_files by (site_id, normalized path), streams from MinIO with
   the stored content_type. SPA fallback: an extensionless path with no
   matching file serves that site's index.html instead of 404 — the standard
   behavior client-rendered SPA routers expect. A path with an extension (a
   genuinely missing .js/.css asset) 404s normally, no fallback.

5. No custom domains, no build step, no environment variables injected into
   the deployed bundle, no preview deployments in v1. A developer who needs
   env-style config (e.g. which BaaS URL to call) handles it the same way
   examples/todo-app's config.js already does: a plain JS file in the
   deployed bundle the developer edits before zipping, not a platform
   feature.

6. Admin UI: /admin/hosting/:project — file count, total size, last-deployed
   timestamp, a deploy (zip upload) action, and a "view live site" link to
   /sites/:project/.
```

**Acceptance**: deploy a zip whose JS calls this same deployment's /rest/v1/* with no CORS
setup anywhere; open /sites/<slug>/ in a browser and confirm the call succeeds same-origin;
hit a client-side route with no matching file and confirm it serves index.html, while a
genuinely missing asset still 404s.

---

# 26. Functions Model

Phase 12. Project-scoped server-side JavaScript/TypeScript functions, invoked over HTTP — a
small "lambda"-style execution surface, promoted from §16's original exclusion list now that
Phase 9's project model exists to scope functions to.

```text
1. Trigger surface: HTTP-invoked only in v1 (POST /functions/v1/<name>,
   AccessTokenGuard-authenticated same as /storage/v1/*, project resolved from
   the caller's JWT projectId claim — no new header, same convention §23
   point 5 established). Any caller whose JWT resolves to that project can
   invoke any of that project's functions in v1 — there is no per-function
   grant table, same "don't build a permission system, trust the platform
   operator" posture §5.2 already takes for the SQL console. Database-
   triggered invocation (a Postgres trigger calling a function on row change)
   is explicitly deferred — it would couple this feature to Realtime's
   LISTEN/NOTIFY infrastructure and is real added design surface, not a small
   extension.

2. functions.functions (id, project_id, name, code text, timeout_ms default
   10000, created_at, updated_at), unique(project_id, name). v1 stores
   function source directly as a text column in Postgres — same
   "developer pastes code, platform runs it, no build step" spirit as the SQL
   editor's own paste-and-execute model — rather than a zip/bundle in MinIO.
   v1 functions are therefore single-file and cannot npm-install a
   dependency; multi-file bundles with a package.json are a reasonable later
   extension once real usage patterns justify the added complexity, matching
   §21's own "not a frozen decision" framing for exactly this kind of
   judgment call.

3. Invocation contract: a function's code must `export default` an async
   handler of shape
   `(ctx: { body, headers, query, project: { id, slug }, auth: { sub, role,
   email } | null }) => Promise<{ status?, body, headers? }>`.
   No raw Postgres credential is ever handed to function code — a function
   that needs to read/write the project's own data gets `ctx.rest`, a fetch
   wrapper pre-bound to that same deployment's /rest/v1/* with the *invoking
   caller's* JWT forwarded automatically. This keeps a function's DB access no
   wider than what PostgREST/RLS already grant that specific caller — it
   can't do anything the caller couldn't already do by calling /rest/v1/*
   directly, consistent with §19 point 3 ("the control service does not
   create CRUD controllers for application tables... does not duplicate
   PostgREST") extended to functions: functions consume the Data API, they
   don't bypass it.

4. functions.invocations (id, function_id, status, duration_ms, error,
   invoked_at) — audit/observability table, same convention as
   admin_sql_history (Phase 1 point 5) and auth.audit_events (Phase 3
   point 8).

5. Sandbox: a new sibling service, `apps/function-runner` — its own Node.js
   process/container (own Dockerfile, own docker-compose entry, internal
   Docker network only, no host port published, same "control-server is the
   only thing that ever talks to this" shape MinIO already has). Chosen over
   an in-process V8 isolate specifically for the crash-containment property:
   a rogue or crashing function must not be able to take down control-server
   itself, which an in-process option can't fully guarantee (a native-module
   crash or fatal V8 error inside the same OS process can still kill the
   host process; a separate OS process boundary can't be breached that way).
   Also declined the heavier option — a real per-invocation container
   (Docker/gVisor/Firecracker) — since that would reopen the Docker-socket
   question §23 point 7 already closed for a much smaller need (restarting
   PostgREST); a fixed sibling service needs no Docker-socket access at all,
   it's just another compose service like postgrest/minio.

   Internally, function-runner uses Node `worker_threads` to execute each
   invocation: one **fresh worker per invocation**, never reused — control-
   server's own process is protected by the OS-process boundary regardless,
   and a fresh worker per call additionally rules out one invocation's
   leftover global state (module cache, global variables, timers) ever being
   observable by a later invocation, which matters most for point 7 below.
   Pooling/reusing workers is a valid later optimization if cold-start
   latency proves to matter in practice, but any such pool must be pinned to
   a single project — a pooled worker may only ever be reused for later
   invocations of the *same* project_id, never across projects.

   Control-server calls function-runner over plain internal HTTP (same
   transport choice as its existing postgrest/minio calls): `POST /run` with
   `{ functionId, code, ctx, timeoutMs }`, where `code` and `ctx` are the
   already-resolved values from point 7 below — the runner is handed
   everything it needs for this one invocation and looks nothing up itself.
   Control-server enforces the function's `timeout_ms` on its own HTTP call
   to the runner; the runner additionally calls `worker.terminate()` on its
   own timer as a second enforcement point, so a hung worker can't pin a CPU
   core indefinitely even if the HTTP-level timeout is somehow bypassed.

   If function-runner is unreachable — crashed, restarting, or otherwise
   unresponsive — an invocation returns 503 to the caller; control-server
   itself is never affected, which is the whole point of the process
   boundary. function-runner is given `restart: unless-stopped` in
   docker-compose.yml so a crash is also self-healing, not just contained —
   the one service in this compose file with an explicit restart policy,
   since it's also the one whose entire job is absorbing crashes from
   function code.

6. functions.invocations (id, function_id, status, duration_ms, error,
   invoked_at) — audit/observability table, same convention as
   admin_sql_history (Phase 1 point 5) and auth.audit_events (Phase 3
   point 8).

7. Cross-project invocation isolation — the mechanism that guarantees a
   project-A token can never execute a project-B function, even against a
   fully compromised function-runner process:

   a) The enforcement point is control-server's own function lookup, not
      anything the runner does. `POST /functions/v1/<name>` resolves the
      caller's `project_id` from their JWT (AccessTokenGuard, same as every
      other project-scoped route), then queries
      `functions.functions WHERE project_id = $1 AND name = $2` — never
      `WHERE name = $2` alone. If no row matches, the response is a 404
      before function-runner is ever contacted. A project-A JWT structurally
      cannot cause project B's function to be looked up, the same way a
      project-A JWT can't look up project B's storage bucket (§24 point 4)
      or hosting site.

   b) function-runner itself holds no database credential and never queries
      `functions.functions`. It only ever executes the specific `code` it
      was handed in one `/run` call's request body — even a fully
      compromised runner process has no independent way to ask "give me
      project B's function code," because it has no capability to look
      anything up by project or name at all. This is the actual security
      property, not merely a convention: the blast radius of a compromised
      runner is "can misbehave within the one invocation it was given,"
      never "can reach across projects."

   c) If function code or resolved function metadata is ever cached (not
      part of v1, but a likely later optimization once real usage exists),
      the cache key must be the function's own row `id` (a UUID, globally
      unique), never `name` alone — names are only unique per
      `(project_id, name)` (point 2), so two different projects can have
      identically-named functions with different code, and a name-keyed
      cache would silently serve the wrong project's code to the wrong
      caller. Any future caching work must treat this as a hard constraint,
      not a tuning choice.

8. Admin UI: /admin/functions/:project — list, create/edit (reuses the SQL
   editor's vendored CodeMirror 6 setup with a JS/TS language mode instead of
   SQL), a test-invoke panel (arbitrary JSON body + view response), and an
   invocation history view reading functions.invocations.
```

**Acceptance**: a function reading ctx.auth.sub and calling ctx.rest returns different data
for two different users' JWTs, each seeing only what their own JWT could already read
directly via /rest/v1/* (proving point 3's isolation property); a project-A JWT invoking a
project-B function 404s; killing the function-runner container mid-invocation (e.g.
`docker compose kill function-runner`) returns a 503 to the caller and control-server's own
`/health` stays healthy throughout.

---

# 27. Scheduler Model

Phase 13. Cron-style scheduling of Functions (§26) — depends on Phase 12 shipping first, since
a scheduled job's unit of work *is* a function invocation, not a separate execution primitive.

```text
1. scheduler.scheduled_jobs (id, project_id, name, function_id references
   functions.functions(id), cron_expression text, enabled boolean default
   true, next_run_at, last_run_at, last_status, created_at, updated_at),
   unique(project_id, name).

2. In-process scheduler inside control-server — no OS cron, no pg_cron
   extension, no new sibling service. Uses a cron-expression parser (e.g.
   `cron-parser`) to compute each job's next_run_at and a single timer loop
   that wakes for the nearest one, the same "one persistent in-process
   worker" shape as Realtime's own LISTEN connection (Phase 8 point 4) rather
   than a library that polls every tick.

3. On fire: invoke the target function in-process via the same execution path
   §26 point 3 defines, but with a synthetic caller identity —
   `ctx.auth = { sub: null, role: 'service_role' }` — since a scheduled run
   has no invoking user. A scheduled job's ctx.rest calls therefore run with
   service_role's full access (bypasses RLS, per §9's existing service_role
   definition), a meaningfully wider grant than any real end-user invocation
   of the same function would get — worth surfacing clearly in the admin UI,
   not just this doc.

4. scheduler.job_runs (id, job_id, started_at, finished_at, status, error) —
   same audit-table convention as functions.invocations/admin_sql_history.

5. Concurrency: a job whose previous run hasn't finished when its next
   scheduled time arrives is skipped for that tick, not queued or run in
   parallel with itself.

6. Missed-run policy: if control-server was down (deploy, restart, crash)
   when a run was due, v1 behavior is skip — no catch-up/backfill on restart.
   Simplest correct v1 behavior; a durable job queue with catch-up semantics
   is a reasonable later extension, not required for a first useful
   scheduler.

7. Known limitation, same shape as Realtime's already-documented one (Phase 8
   point 5's admin-card caveat): today's deployment target is single-instance
   control-server, so the in-process timer loop is correct as designed. If
   this is ever run as multiple replicas, every replica would independently
   fire every job — needs a DB-level claim/lock (e.g. SELECT ... FOR UPDATE
   SKIP LOCKED on the due job row) before that's safe, not needed today.

8. Admin UI: /admin/scheduler/:project — list jobs (name, function, cron
   expression, next/last run, enabled toggle), create/edit form, a "run now"
   button bypassing the schedule for manual testing, and a run-history view
   reading scheduler.job_runs.

9. Explicit non-goal: no dedicated health/metrics surface for the scheduler
   (no `/health/scheduler`, no scheduler block added to `/health/ready`). The
   scheduler is one in-process component of control-server, not a separate
   service — its liveness is already covered by control-server's own health
   endpoint, and `scheduler.job_runs` (point 4) already gives an admin a
   per-job success/failure signal without a new health surface. Revisit only
   if real operational usage shows a concrete gap this doesn't cover.
```

**Acceptance**: a function that writes a timestamp row via ctx.rest, scheduled at a short
interval via the admin UI, produces matching scheduler.job_runs and function-owned rows
unattended over several minutes with no invoking JWT involved; disabling the job stops it
firing.

---

# 28. Admin UI Redesign

Phase 14. A visual/UX pass across the entire admin console (`apps/control-server/src/admin-ui`),
not a new backend capability — no schema, route, or auth changes. Triggered by the console
having grown organically across Phases 0-12 (each phase adding its own page/CSS file with no
shared review of the whole), leaving real usability problems: the Database Explorer is close to
unreadable once a schema has more than a few tables, several controls (buttons vs. selects vs.
inputs) don't align on a shared baseline, action affordances are plain text buttons ("Copy",
"Edit", "Delete") instead of recognizable icons, and the API Keys secret-reveal panel has no way
to dismiss it once shown. Scope is deliberately **every** page (full redesign, not just the
worst offenders), decided directly rather than treated as still-open — see the per-page list
below.

```text
1. Design tokens: a --color-accent / --color-accent-hover pair is added alongside the existing
   monochrome tokens in admin.css and takes over --color-primary's job on primary buttons,
   active nav state, links, and focus rings; the surface/border/text tokens stay as they are —
   this is an accent addition, not a repaint. A shared control-height token is introduced and
   applied consistently to .btn, input, select, and textarea so a button sitting next to a
   select in the same toolbar row lines up on both height and vertical-center, the concrete
   "buttons and select boxes are not aligned" complaint. A shared .page-header pattern (title +
   optional one-line description on the left, primary actions on the right, both vertically
   centered) replaces the current bare <h1> followed by a separately-laid-out .toolbar div, used
   on every page from here on.

2. Icon system: no new npm dependency, no icon font, no CDN — consistent with this project's
   existing "vendor what you need with esbuild, never load third-party script tags" posture
   (the CodeMirror bundle, scope.md §5.2). A small hand-picked set of inline SVG icons (copy,
   edit, delete/trash, save, add/plus, close/×, view/eye, upload, download, refresh, chevron
   expand/collapse, external-link, search, run/play, history, warning) lives in one shared
   partial/snippet set and is used to replace bare-text action buttons ("Copy" → a copy icon)
   everywhere across the console. Every icon-only control keeps a text label available to
   assistive tech and mouse users: an `aria-label` plus a native `title` attribute (the "alt
   text" the icons need) — no icon ever ships silent. Labelled buttons that already carry visible
   text (e.g. "Create project") get an icon *in addition to* the label, not instead of it — icons
   only fully replace text where the action is unambiguous and space-constrained (row-level
   actions in dense tables/lists).

3. Database Explorer (worst-offending page, the direct trigger for this phase): replaces the
   current single long vertical stack of every table's details with a sticky top strip of
   schema-name jump links (one per schema currently returned by /admin/v1/database/objects) plus
   a grouped accordion below it — clicking a schema name in the strip scrolls to and expands that
   schema's group; within a group, only the first table starts expanded, the rest collapsed,
   same interaction the SQL editor's history panel already uses for progressive disclosure. A
   single table's own detail view (currently columns/keys/indexes/policies stacked one after
   another as separate <h4> blocks) is reorganized so the columns table (the thing read most
   often) renders full-width at the top, with keys/indexes/policies laid out as a responsive
   multi-column card row below it instead of a continued vertical stack. Deep-linkable via a
   `?schema=<name>` query param, read on page load, so the Projects page (point 4) and any other
   future page can link directly into a specific schema's group already expanded/scrolled-to.

4. Projects page: the project name in the table becomes a link to `/admin/api?projectId=<id>`
   (API Explorer, already project-scoped via the existing project selector — the link just
   pre-selects it) and the schema name becomes a link to `/admin/database?schema=<schemaName>`
   (Database Explorer, consuming the deep-link param from point 3). No new backend route needed
   for either — both target pages already have the data, this only wires an existing selector to
   a query param on page load.

5. SQL Editor toolbar: the current single flat-wrapping row (project select, two run buttons,
   cancel, row-limit input, history toggle, snippet select, upload button, status text) is
   regrouped into logical clusters with a visual divider between them — [project selector] |
   [run statement, run script, cancel] | [row limit, snippet picker, upload] | [history toggle] —
   with icon+label buttons for the run/cancel/history/upload actions (point 2's icon set) each
   carrying a tooltip via `title`, so the toolbar reads as a coherent instrument panel rather than
   a wrapped list of controls.

6. API Keys secret-reveal panel: the concrete reported bug — "when public keys are displayed, it
   can't be closed, it stays there" — is that `#secret-banner` has no dismiss control at all once
   `showSecretBanner()` populates it (api-keys.js), and admin-users.js's identical pattern has
   the same gap. Fixed by adding an explicit close (×) icon button that hides the panel, plus
   auto-hiding it whenever the project selector changes or a different key's reveal/create action
   fires (so an old token can't linger on screen looking like it belongs to whatever's currently
   selected).

7. Functions editor: replaces the plain `<textarea class="code-textarea">` for both the function
   code and the test-invoke JSON body with the SQL editor's already-vendored CodeMirror 6 setup
   (scope.md §26 point 8 called for this directly; Phase 12 shipped a textarea instead as a
   scoping cut, not a decision reversal). Requires adding `@codemirror/lang-javascript` (and
   `@codemirror/lang-json` for the invoke-body editor) to the same `scripts/build-vendor.mjs`
   entry that already produces `codemirror.bundle.js`, exporting a `javascript`/`json` language
   extension alongside the existing `sql`/`PostgreSQL` one — no new runtime dependency shape, the
   same vendoring pipeline the SQL editor already uses.

8. Remaining pages (Dashboard, Storage, Hosting, Users, Audit, API Explorer, login, landing) —
   each gets the same page-header pattern (point 1), icon-ified actions (point 2), and alignment
   fixes, plus whatever page-specific tightening falls out of applying those consistently: the
   Dashboard's KPI grid and per-project table get consistent card styling with the rest of the
   console; Storage/Hosting's two-panel layouts get the same visual treatment as the redesigned
   Functions page (point 7) since they already share its master-detail shape; Users/Audit's
   pagination controls and toolbars get the same icon/alignment pass as the SQL editor's.

9. Explicit non-goals for this phase: no dark mode (not requested, real added surface — every
   page would need verifying under both themes), no new UI framework or client-side router (the
   console stays server-rendered Handlebars + vanilla JS per page, consistent with every prior
   phase), no new icon-library/font dependency (point 2), no schema/API changes of any kind —
   this phase touches `admin-ui/` only.
```

**Acceptance**: every page loads with no visual regression in a real browser (this is a UI
phase — Playwright/headless testing is not the verification method, manual browsing is, same as
every prior admin-UI phase); the Database Explorer's schema-jump strip correctly scrolls to and
expands the target schema for a database with several schemas and many tables each; a Projects
page row's name and schema links land on the correct pre-filtered API Explorer / Database
Explorer view; the API Keys secret panel can be dismissed and does not persist across a project
switch; the Functions code editor and invoke-body editor both apply real JS/TS and JSON syntax
highlighting respectively.

---

# 29. Database Management Actions (Explorer)

Phase 15. The Database Explorer (§28 point 3) is currently read-only: it shows schemas, tables,
columns, keys, indexes, policies, and functions, but every structural change has to go through
the free-text SQL Editor. This phase adds three targeted destructive/read actions directly into
the Explorer's own table/function rows — view a function's real source, delete a single column,
delete a whole table — without turning the Explorer into a general DDL tool (create/rename/alter
stays the SQL Editor's job). Three clarifying questions were asked and resolved: table deletion
requires typing the table's name to confirm (not a plain Yes/No — this is the most destructive
action in the console); a table or column that has a dependent view *always* blocks deletion
(never silently `CASCADE`s a view out of existence — same reasoning extended to a table
referenced by another table's foreign key, since that's the same "something else depends on
this" category); the function-reference scan (point 4 below) only searches the target table's
own schema, consistent with the schema-per-project isolation model — it never reads or exposes
another project's function source.

```text
1. Function source viewer (read-only): a function's name in the Explorer's per-schema Functions
   block becomes clickable, opening a panel with a read-only CodeMirror 6 instance
   (EditorState.readOnly.of(true)) running the sql(PostgreSQL) mode already vendored for the SQL
   Editor (scripts/vendor-entry.js already exports `sql`/`PostgreSQL` — no new vendor package).
   Source comes from a new endpoint returning `pg_get_functiondef(oid)` (the complete
   `CREATE OR REPLACE FUNCTION ...` statement — language, signature, and body together, correctly
   disambiguates overloaded function names since it's looked up by oid, not name). No edit/save/
   add controls anywhere in this panel — the SQL Editor already owns function authoring
   (scope.md §26 point 8); this is strictly a viewer.

2. Delete column: a delete icon (§28 point 2's icon set) on each row of a table's columns list
   opens a confirmation modal showing what the column-drop will affect — whether it's part of the
   primary key, which indexes reference it (auto-dropped with the column, informational), and
   whether any view in the same schema depends on it (blocks deletion outright, per the resolved
   question above — the modal lists the blocking view(s) and disables the delete button until the
   admin removes/edits them via SQL Editor). A plain confirm (no typed name required — reserved
   for whole-table deletion, the more destructive action) executes
   `ALTER TABLE "schema"."table" DROP COLUMN "column";` inside a single transaction via
   `AdminQueryService.withConnection()`.

3. Delete table: a delete icon in each table's header opens a confirmation modal built from a new
   preview endpoint that reports: an estimated row count (`pg_class.reltuples`, not a full
   `COUNT(*)` — avoids a slow sequential scan on a large table just to populate a warning dialog),
   the number of indexes/policies/triggers that will go with it (informational — Postgres drops a
   table's own indexes, policies, and triggers automatically as part of `DROP TABLE`, they are not
   separate objects that need their own delete step), any dependent views, and any other table's
   foreign key referencing this one. Dependent views or referencing foreign keys always block
   deletion (same rule as point 2) — the modal lists exactly what's blocking and where. If nothing
   blocks it, the delete button stays disabled until the admin types the table's exact name into a
   confirmation field. On confirm, the backend re-validates the same blockers server-side (the
   preview is not trusted as the sole gate — state can change between preview and confirm) and
   runs a single `DROP TABLE "schema"."table";` (no `CASCADE`) inside one transaction. This is a
   deliberate deviation from a literal "delete the data, then delete the indexes/policies"
   two-step process: Postgres already makes a bare `DROP TABLE` atomic and fail-fast (it refuses
   to run at all if a blocking dependent exists, with no partial effect), and it already removes
   the table's own indexes/policies/triggers/data together as one operation — a hand-rolled
   two-phase delete would just be re-implementing a guarantee Postgres already provides, with more
   surface for a partial-failure bug.

4. Function-reference warning (best-effort, non-blocking): part of the same delete-table preview,
   a simple text scan of every function's source in the *target table's own schema* — one
   `pg_proc` lookup, `prosrc`/`pg_get_functiondef` text checked with a word-boundary regex for the
   table's bare and schema-qualified name. Any match is listed in the warning modal ("N function(s)
   in this schema mention this table — verify before deleting: fn_a, fn_b") but never blocks
   deletion, since text matching can't distinguish a genuine reference from a coincidental name
   collision (a column, variable, or string literal) — this is explicitly a heads-up, not a
   dependency graph. Scoped to one schema only, never cross-schema, so a project's function source
   is never read or surfaced outside its own project boundary.

5. Backend: a new `db-management` module (controller + service, sibling to the existing
   `db-explorer` module, same `AdminSessionGuard`) rather than extending `db-explorer.service.ts`
   directly — keeps the read-only introspection path (hit on every Explorer page load) separate
   from the new destructive/transactional code path, and gives this phase's PRs the same
   one-concern-per-PR shape as every prior phase. Reuses `AdminQueryService.withConnection()` (the
   same primitive the SQL Editor already uses) for transaction-scoped DDL, and
   `AuthAuditService.record()` (the existing `admin.*`-prefixed convention, e.g.
   `admin.table_deleted`/`admin.column_deleted`, metadata carrying schema/table/column/row-count/
   deleting-admin's email) fired after a successful commit — the same audit trail every other
   admin destructive action already writes into.

6. No RBAC change: this console currently has one admin session type, no roles/permissions
   (`AdminSessionGuard` only checks the session cookie, `AdminIdentity` has no role field) — every
   other admin action (revoke a key, delete a function, delete a user) already carries the same
   "any authenticated admin can do this" trust level, so table/column deletion doesn't introduce a
   new class of risk relative to what the console already allows. Introducing admin roles is
   explicitly out of scope for this phase (a real gap, worth a future phase, not silently
   bundled in here).
```

**Acceptance**: a real table with rows, at least one index, one RLS policy, and one function in
the same schema that textually mentions the table name — the delete-table modal shows the correct
row estimate, index/policy count, and lists that function as a non-blocking reference warning;
attempting to delete a table that a view depends on, or that another table's foreign key
references, is blocked with the specific blocking object named, both before (preview) and if
forced after editing state in between (server-side re-check); deleting an unblocked table only
proceeds after typing its exact name, and afterward the table plus its indexes/policies/triggers
are all gone with a single `admin.table_deleted` audit row recorded; deleting a single column
behaves the same way for its narrower blocker set (dependent views only); the function source
viewer shows the real `pg_get_functiondef` output with SQL syntax highlighting and has no
edit/save affordance anywhere in it.

---

# 30. Secrets Vault Model

Phase 16. Project-scoped, encrypted-at-rest key/value secret storage, readable at runtime only by
Functions (§26) via a new `ctx.secrets` capability — the credential-management counterpart to
`ctx.rest`. Never part of the original exclusion list (§16); added once Functions existed as the
thing that actually needed it (a function that calls a third-party API today has nowhere to put
that API key except hardcoded in `functions.functions.code`, visible to any admin console user
who opens the function editor). No dependency on Phase 13/Scheduler — either can ship first.

```text
1. Storage: a new `vault` schema, created in packages/database-bootstrap/sql/002_schemas.sql
   (superuser-run bootstrap, same convention as storage/hosting/functions — "never exposed
   through PostgREST, owned by baas_admin"), containing one table via node-pg-migrate:
   vault.secrets (id, project_id references platform.projects(id) on delete cascade, name text,
   nonce bytea, ciphertext bytea, created_at, updated_at), unique(project_id, name) — the same
   per-project-scoped-entity shape functions.functions already uses. No version-history table:
   a rotate is an UPDATE in place (new nonce + ciphertext, updated_at bumped), the old value is
   gone. No per-project row-count cap in v1, same "trust the platform operator" posture already
   extended to functions.functions and hosting.site_files.

2. Naming convention: secret names are validated as env-var-style identifiers,
   ^[A-Z][A-Z0-9_]*$ (uppercase, digits, underscore, must start with a letter) — enforced by the
   same zod-schema-at-the-controller pattern already used for function names
   (functions-admin.controller.ts's createFunctionBodySchema), not just a UI convention. Chosen
   because a secret conceptually replaces a hardcoded env-style credential inside function code
   (STRIPE_API_KEY, SENDGRID_KEY), so ctx.secrets.get('STRIPE_API_KEY') should read the same way
   process.env.STRIPE_API_KEY would in an ordinary Node app. The admin console's create/rotate
   form shows this pattern as inline placeholder/help text (e.g. "STRIPE_API_KEY"), not just a
   validation error after the fact.

3. Crypto: libsodium-wrappers (ISC license), crypto_secretbox_easy/crypto_secretbox_open_easy —
   XSalsa20-Poly1305 authenticated symmetric encryption, the same primitive class already trusted
   for this platform's other cryptographic work (Ed25519 JWT signing, Argon2id password hashing)
   rather than a hand-rolled AES-GCM wrapper over Node's raw crypto module. One master key for the
   whole deployment, VAULT_MASTER_KEY_BASE64 (32 raw bytes, base64-encoded — crypto_secretbox_KEYBYTES),
   supplied via env or mounted file per the existing "secrets through environment or mounted
   files" convention (§6), generated by a new one-off script (scripts/generate-vault-key.mjs,
   mirroring generate-jwt-keypair.mjs) — not run automatically, key generation is a deliberate
   manual action same as the JWT keypair. Each encrypt call generates a fresh random nonce
   (crypto_secretbox_NONCEBYTES, via randombytes_buf) and stores it alongside the ciphertext —
   nonces are public data, safe to store in the same row, never reused across encryptions of the
   same or different values. If VAULT_MASTER_KEY_BASE64 is ever lost, every stored secret becomes
   permanently undecryptable with no recovery path, the same class of risk §8 already accepts for
   AUTH_JWT_PRIVATE_KEY_BASE64 but with a worse failure mode (a lost JWT key just forces
   re-login; a lost vault key destroys data) — worth calling out explicitly in the eventual
   Phase 6b backup/restore docs, not deferred silently.

4. Admin API and write-only semantics: unlike API keys (§14), where the platform generates the
   secret value and must reveal it once, a vault secret's value is supplied by the admin
   themselves (they already have it — a third-party API key, a webhook secret) — so there is
   nothing to "reveal" at creation time at all. Create/rotate accept {name, value} and the
   response never echoes value back, not even once; list returns only {name, updatedAt}
   (never nonce/ciphertext, and there is no decrypt-for-display endpoint anywhere in the admin
   surface). This is a stricter write-only guarantee than API keys already have, not a weaker
   one — there is no code path in this feature that can ever return a stored secret's plaintext
   to the admin console, only to a function's own ctx.secrets.get() call at invocation time.

5. Function runtime access — ctx.secrets.get(name): mirrors ctx.rest's shape (§26 point 3) but
   the mechanics are necessarily different, since ctx.rest is a closure pre-bound to POSTGREST_URL
   with no new network path required, while a secret's plaintext only ever exists inside
   control-server's own process (decrypted on demand) and must reach a function-runner worker
   that holds no database credential and cannot decrypt anything itself. So this is a new reverse
   channel: the worker calls back into control-server, once per ctx.secrets.get() call, over the
   internal docker network — the same direction ctx.rest already calls out to PostgREST, just to
   control-server instead. Authorization for this callback cannot rely on network topology alone
   the way function-runner's own inbound /run endpoint does (function-runner has no host port
   published; control-server's HTTP port, by contrast, is already published to the host in
   docker-compose.yml for local dev access, so "only reachable over the internal network" does not
   hold for it) — it needs a real credential. control-server mints a short-lived, single-invocation
   opaque token (crypto.randomUUID(), an in-memory Map<token, {projectId, expiresAt}> with a TTL
   slightly beyond the function's own timeout_ms) at the same moment it calls function-runner's
   /run (FunctionsService.invoke()), includes it only in the internal wire representation of ctx
   (never in the public ctx object function code itself can inspect — same "internal-only,
   stripped before reaching the handler" treatment §26 point 5's InvocationCtxWire already gives
   schemaName/callerAuthorization), and deletes it the moment that invocation finishes, errors, or
   times out. A new POST /internal/vault/resolve endpoint on control-server (a new
   VaultInternalController, not AdminSessionGuard/AccessTokenGuard-protected — it has its own
   token check) accepts {name} plus an X-Invocation-Token header, resolves the token to its
   projectId, looks up + decrypts vault.secrets WHERE project_id = $1 AND name = $2, and returns
   {value} or 404. No per-function grant table restricts which secrets a given function may read
   within its own project — same "any caller already trusted with this project can use anything
   project-scoped" posture §26 point 1 already takes for function invocation itself; the boundary
   that matters, and the one this token actually enforces, is cross-*project* isolation, not
   cross-function isolation within one project. A scheduled invocation (§27) goes through this
   exact same path with no special-casing, since scheduler fires functions via
   FunctionsService.invoke() like any other caller.

6. Deployment wiring: /internal/vault/resolve is deliberately never added to
   infrastructure/proxy/Caddyfile's public routing table — same precedent as /metrics
   (metrics.controller.ts: "Deliberately not routed through Caddy"), reachable only from
   function-runner over the internal docker network calling control-server's internal compose
   hostname directly. function-runner gains a new CONTROL_SERVER_URL env var
   (http://control-server:3000, alongside its existing POSTGREST_URL) in docker-compose.yml.

7. Audit: vault.secret_created / vault.secret_rotated / vault.secret_deleted via the existing
   AuthAuditService.record() convention (admin.*-prefixed events elsewhere; these use a vault.*
   prefix, matching how realtime/functions/hosting each introduced their own event-type prefix
   rather than overloading admin.*). Deliberately no vault.secret_read event per function
   invocation — that's a potentially high-volume, per-call event unlike every other audit event
   this platform records today (all low-frequency admin actions); if per-read auditing is ever
   needed, it should be a deliberate later addition, not a default this phase ships silently.

8. Explicit non-goals for v1: no rotation/version history (point 1 — overwrite in place only), no
   admin-facing reveal-after-creation of any kind (point 4), no per-project secret-count cap
   (point 1), no per-function secret access-control list within a project (point 5), no secret
   sharing/reference across projects (every lookup is project_id-scoped, same isolation shape as
   every other project-scoped table on this platform), no dedicated health/metrics endpoint for
   the vault (mirrors §27 point 9's identical non-goal for the scheduler — this is one
   control-server module, not a separate service).
```

**Acceptance**: a function calling `ctx.secrets.get('STRIPE_API_KEY')` receives the correct
decrypted value for its own project; the same call from a function belonging to a different
project — even one that happens to define a secret with the identical name — receives that
*other* project's own value or `null`, never a cross-project leak, proving isolation comes from
the per-invocation token's bound `project_id`, not from the secret name alone; the admin console's
vault page never displays a secret's value anywhere after its initial create/rotate submission
(inspecting network responses for `list`/`get` confirms no `ciphertext`/`value` field is ever
returned); creating a secret with a lowercase or space-containing name is rejected client- and
server-side with the `UPPER_SNAKE_CASE` convention shown as the correction hint; killing
`function-runner` mid-invocation leaves no orphaned invocation token reachable after its TTL
elapses.

---

# 31. Rate Limiting Model

Phase 17. Closes the still-open Phase 6b items (rate limiting, brute-force login protection).
Lowest-effort of the five newly-promoted phases — mainly configuration on top of an
off-the-shelf NestJS package, not new architecture.

```text
1. Library: @nestjs/throttler (official NestJS package), registered as a global
   APP_GUARD in AppModule. In-memory storage — the default ThrottlerStorageService,
   no Redis — consistent with this platform's already-established single-instance
   deployment assumption, the same caveat already accepted for Realtime (§22) and
   Scheduler (§27).

2. Global default: every control-server HTTP route (auth/admin/rest-adjacent
   control-server routes, storage, hosting, functions) gets a default throttle —
   env-configurable RATE_LIMIT_GLOBAL_MAX / RATE_LIMIT_GLOBAL_WINDOW_MS, same
   *_MAX_*-style convention as every other tunable on this platform (§21 point 6,
   §25 point 3). Tracked per client IP by default (@nestjs/throttler's own
   getTracker()).

3. Stricter per-route override on the three routes where brute-forcing actually
   matters: POST /auth/v1/login, POST /auth/v1/signup, and POST /auth/v1/mfa/verify
   (§33, once Phase 19 ships — this route doesn't exist until then, added to the
   same override list at that point). A custom getTracker() on these routes keys on
   (ip_address, body.email) together, not IP alone — so one attacker can't hide a
   distributed-email brute force behind a single IP's aggregate budget, and one
   legitimate user's repeated mistakes from one IP don't exhaust the budget for
   every other email attempted from a shared IP (an office NAT, a mobile carrier).
   Env-configurable RATE_LIMIT_AUTH_MAX / RATE_LIMIT_AUTH_WINDOW_MS, tighter defaults
   than the global limit.

4. Persistent lockout tracking, separate from and in addition to raw request-rate
   throttling: request-rate throttling alone doesn't catch a slow, low-and-steady
   brute force spread out under the rate limit's window. A new auth.audit_events
   event type, auth.login_failed (already-existing table, §7 — no new table), is
   recorded on every failed login attempt (email, ip_address, attempted_at already
   fit the existing audit_events shape). Before processing a login attempt, the
   login handler counts auth.login_failed events for that email in the last
   LOGIN_LOCKOUT_WINDOW_MINUTES; at or above LOGIN_LOCKOUT_THRESHOLD it returns 429
   immediately without checking the password at all (avoids a timing side-channel
   revealing whether the account exists via a slower bcrypt/argon2 comparison path).
   A successful login does not need to explicitly clear the counter — the window is
   time-based, not a running total — matching the request-rate throttle's own
   windowed-not-cumulative semantics.

5. Response shape: standard @nestjs/throttler 429 with a Retry-After header,
   propagated through Caddy unchanged (no reverse-proxy-level rate limiting added
   in this phase — Caddy passes the upstream status/headers through as-is).

6. Explicit scope boundary: this phase limits control-server's own routes only. It
   does not rate-limit PostgREST's /rest/v1/* directly — fronting PostgREST through
   control-server to add limiting there would mean control-server intercepting
   every data-API call, which contradicts §19 point 3 (the control service does not
   duplicate PostgREST). A future reverse-proxy-level limiter (a Caddy rate-limit
   plugin, applied uniformly regardless of upstream) is a reasonable follow-up if
   raw REST traffic ever needs limiting, not required for this phase.

7. No new admin UI page in v1 (same "no dedicated surface" non-goal already used
   for Scheduler §27 point 9 and Vault §30 point 8) — lockout events are just
   auth.login_failed rows, already visible through the existing Audit page.
```

**Acceptance**: repeated wrong-password attempts against one email from one IP return 429 after
`RATE_LIMIT_AUTH_MAX` attempts within the window, with a `Retry-After` header intact through
Caddy; a different email attempted from the same IP is unaffected until its own threshold;
sustained slow attempts spread out to stay under the request-rate window still trigger the
persistent `LOGIN_LOCKOUT_THRESHOLD` lockout once enough `auth.login_failed` events accumulate;
ordinary traffic under the global limit sees no behavior change.

---

# 32. Outbound Email Model

Phase 18. Revised 2026-09-12 from the original Resend-only sketch (below) at the user's
direction: provider-agnostic, admin-configured **per project** — the same shape as the AI
Gateway (§35), not the "shared platform service" framing the original sketch used. Two concrete
adapters ship in v1: Resend (REST API) and a generic SMTP adapter (`nodemailer`) — SMTP alone
already covers SES, SendGrid, Mailgun, Postmark, Gmail, or any self-hosted mail server with zero
vendor-specific code, so this pair gives genuine "works with almost anything" coverage without
writing a bespoke adapter per vendor. Finally implements the password-reset email deferred since
§6, and gives Functions a `ctx.email.send()` capability for their own transactional
notifications.

```text
1. EmailProvider interface: send({to, subject, html, text?}) => Promise<{providerMessageId?}>.
   A new EmailModule holds the interface and its two adapters (ResendProvider,
   SmtpProvider) — structurally identical in spirit to the AI Gateway's AiProvider
   (§35 point 1) and PDF's PdfProvider (§34 point 1).

2. email.provider_configs (id, project_id references platform.projects(id) on
   delete cascade, provider text check (provider in ('resend','smtp')),
   from_address text not null, smtp_host text, smtp_port integer, smtp_secure
   boolean, smtp_username text, enabled boolean default true, created_at,
   updated_at), unique(project_id) — one active provider+config per project in v1,
   same "one active X per project" shape as ai.provider_configs (§35 point 2) and
   hosting.sites (§25 point 2). The smtp_* columns are simply null/unused when
   provider = 'resend'.

3. Secret storage reuses the Secrets Vault (§30) exactly the way the AI Gateway
   does (§35 point 3), now that this is genuinely per-project, admin-supplied,
   project-owned configuration rather than a platform-wide credential: the
   project's Resend API key or SMTP password is written as a vault secret under a
   reserved name, EMAIL_PROVIDER_SECRET, in that project's own vault namespace —
   same vault.secrets table, same libsodium primitive, same write-only-reveal
   semantics (§30 point 4). This makes Phase 18 depend on Phase 16 (Vault, already
   shipped) exactly as Phase 21 does, and needs no new encryption path at all.

4. Admin UI: /admin/email/:project — a provider dropdown (Resend/SMTP), a
   from_address input, SMTP-specific fields shown only when provider = 'smtp'
   (host/port/secure/username), a secret input reusing the Vault page's own
   write-only-secret-input component (writing to EMAIL_PROVIDER_SECRET), and an
   enabled toggle. A recent-sends list reading email.sent_messages (point 6) below
   it, same list-only pattern the original sketch planned.

5. No template engine, no stored/editable templates in v1 — a real added surface,
   deferred per this platform's "start simple" posture elsewhere (mirrors §26
   point 2's single-file-no-dependency stance and §30 point 1's no-version-history
   stance). The password-reset email body is a small hardcoded HTML string built by
   EmailModule itself; ctx.email.send() takes raw {to, subject, html, text?}
   directly from calling code.

6. email.sent_messages (id, project_id not null references platform.projects(id),
   to_address, subject, provider text, status ('sent'|'failed'),
   provider_message_id, error, created_at) — audit table, same convention as
   functions.invocations / scheduler.job_runs. project_id is now not-null (unlike
   the original platform-level sketch) since every send always has a project —
   there is no platform-level system-email case now that config itself is
   per-project.

7. Self-service password reset, finally implemented: POST
   /auth/v1/password-reset/request {email} (public, unauthenticated, project
   resolved from the caller's publishable-key bearer per the existing §23 point 5
   convention) generates the existing auth.password_reset_tokens row (already
   modeled in §7) and emails a link built from PASSWORD_RESET_URL_TEMPLATE (an env
   var like "https://myapp.example/reset?token={token}" — a multi-project platform
   has no single admin-owned reset page for arbitrary tenant end-users, so the
   developer's own frontend URL is configured per deployment, same spirit as
   examples/todo-app's own config.js convention, §25 point 5). Always returns 200
   regardless of whether the email exists *or whether that project has email
   configured at all* — a project with no enabled email.provider_configs row
   simply logs a 'failed' email.sent_messages row (error: "no provider
   configured") and still returns 200, since leaking configuration state to an
   unauthenticated public endpoint is the same class of problem as leaking
   account existence.

   This is additive to, not a replacement for, the existing §6 admin-generated
   reset-link/temporary-password flow — that flow keeps working exactly as it does
   today.

8. ctx.email.send({to, subject, html, text?}) Functions capability: reuses the
   internal-callback mechanism already built for ctx.secrets (§30 point 5) rather
   than inventing a new one — the same per-invocation opaque token, minted by
   control-server at the same moment it calls function-runner's /run, is now also
   accepted by a new POST /internal/email/send endpoint (alongside the existing
   /internal/vault/resolve). Unlike the public password-reset endpoint (point 7),
   a Function calling this with no email provider configured gets a real error
   back (not a silently-swallowed success) — a developer authoring a function
   should immediately know to configure email for their project, the same
   "fail loudly to the caller who can act on it" posture the AI Gateway takes for
   an unconfigured project (§35 point 10). Recorded into email.sent_messages with
   the invoking function's project_id. A scheduled invocation (§27) goes through
   this identical path with no special-casing, same as vault access already does.

9. Volume control: a single global EMAIL_MAX_PER_MINUTE throttle on the internal
   send endpoint, reusing Phase 17's @nestjs/throttler infrastructure directly
   rather than a new per-project quota table — matches the "trust the platform
   operator" posture already extended to functions.functions and
   hosting.site_files row counts (no cap there either).

10. Explicit non-goals: no inbound email, no bounce/complaint webhook handling
    (Resend and most SMTP relays support delivery-event webhooks, but wiring a
    public webhook endpoint with signature verification is real added surface, not
    required for v1's send-only scope), no template system (point 5), no
    per-project sending quota (point 9), no per-project vendor beyond the two
    adapters in point 1 (a third provider is a config addition to EmailModule
    later, not a v1 requirement).
```

**Acceptance**: configuring project A with provider=resend and project B with provider=smtp
(each with its own vault-stored secret) and triggering a send from each (via
`/auth/v1/password-reset/request` or `ctx.email.send`) results in a real delivered email from
the correct, distinct provider for each project, proving per-project provider selection actually
works; requesting a password reset for a non-existent email, or for a project with no email
provider configured, both return the identical 200 response with no observable difference; a
Function calling `ctx.email.send()` in a project with no configured provider gets a clear error,
not a silent no-op; a successful send produces a `'sent'` row in `email.sent_messages` carrying a
real `provider_message_id` and the correct `provider` value.

---

# 33. MFA Model

Phase 19. TOTP (RFC 6238) plus backup codes, the v1 factor per §18 Expansion 6 — no SMS, no
email OTP, no WebAuthn/passkeys. Lives in the Auth module itself, not Functions, since MFA is
part of the login handshake and a project-scoped, post-authentication Function has no way to
intercept that handshake. Revised 2026-09-12 from the original sketch (below) at the user's
direction: a project-level, admin-controlled, default-**off** policy is a core v1 requirement,
not a deferred fast-follow — turning it on is what makes "the MFA screen" appear for that
project's users.

```text
1. platform.projects gains mfa_required boolean not null default false — a plain
   column, matching how schema_name/anon_role/authenticated_role/service_role_role
   already live directly on that table (no generic "project settings" table exists
   yet, and one isn't needed for a single flag). LoginService already receives the
   full ProjectRow (a plain SELECT *), so this flows into the login handshake with
   no new query — it's just project.mfa_required.

2. auth.mfa_factors (id, user_id references auth.users(id) on delete cascade,
   type text default 'totp', secret_nonce bytea, secret_ciphertext bytea, verified
   boolean default false, created_at, verified_at), unique(user_id) — one TOTP
   factor per user in v1 (not multiple enrolled devices); multiple factors per user
   is a reasonable later extension, not required now. The TOTP secret is encrypted
   with the exact same libsodium primitive and VAULT_MASTER_KEY_BASE64 master key
   already built for the Secrets Vault (§30 point 3) — no new crypto dependency, no
   second master key to manage or lose.

3. auth.mfa_backup_codes (id, user_id references auth.users(id) on delete cascade,
   code_hash text, used_at nullable, created_at) — codes hashed with Argon2id (the
   same password-hashing primitive already in the stack, §5 recommended-stack
   table), one-time use (used_at set on redemption, a used code is never valid
   again). A batch of 10 is generated at successful enrollment and shown once (same
   write-once-reveal convention as API keys, §14, and Vault secrets, §30 point 4);
   regenerating invalidates all previously-unused codes.

4. TOTP implementation: the `otplib` npm package (MIT-licensed, RFC 6238-compliant)
   for secret generation and code verification — the crypto-primitive reuse
   instruction in §18 Expansion 6 is about the encryption-at-rest layer (point 2),
   not the TOTP algorithm itself, which unavoidably needs its own well-known
   implementation.

5. Three-way login handshake. POST /auth/v1/login, after password verification
   succeeds, branches on (project.mfa_required, whether the user has a verified
   mfa_factors row):

   a) No requirement, no factor — normal login, access/refresh tokens returned
      exactly as today. Unchanged v1 behavior for a project that never turns MFA on.

   b) A verified factor exists (because project.mfa_required is true, or because
      the user voluntarily self-enrolled earlier, point 8) — login does not return
      tokens directly. It returns { mfaRequired: true, mfaToken }. mfaToken is a
      short-lived (~5 minute), narrowly-scoped signed token (same Ed25519 key, but
      a distinct aud/role claim shape that AccessTokenGuard structurally rejects,
      so it can never be mistaken for or replayed as a real access token) carrying
      user_id and project_id. POST /auth/v1/mfa/verify {mfaToken, code} validates
      the TOTP code (or a backup code as fallback, marking it used) against the
      token's user_id, and on success issues real tokens through the exact same
      session-creation path a normal login uses.

   c) project.mfa_required is true but the user has no verified factor yet — login
      returns { mfaEnrollmentRequired: true, mfaToken } instead (same token shape as
      (b)). This is the new case, and is literally "the MFA screen comes up": the
      calling frontend uses this mfaToken against POST /auth/v1/mfa/enroll (get the
      otpauth:// URI / QR data) and then POST /auth/v1/mfa/verify-enrollment {code}
      — which, since the password step already succeeded, issues real tokens
      immediately on success rather than requiring a second /mfa/verify round-trip.

   Enforcement is checked at login time only — turning project.mfa_required on does
   not retroactively touch any already-issued session or refresh token. A user with
   a live session keeps working until it naturally expires or they log out; the
   branch above is only evaluated on a fresh password login. This was a deliberate
   choice over immediately revoking every session for the project: nothing else on
   this platform mass-revokes sessions on a settings change, and building that
   machinery for this one case wasn't justified.

6. auth.audit_events gains no new event type for (c) specifically beyond the
   existing convention — mfa.enrollment_required / mfa.enrolled / mfa.verified are
   recorded the same way user.login already is, via AuthAuditService.record().

7. MfaEnrollmentGuard: a single guard used by both POST /auth/v1/mfa/enroll and
   POST /auth/v1/mfa/verify-enrollment, accepting *either* a valid mfaToken (the
   forced mid-login path, point 5c) *or* a real access token (voluntary self-service
   enrollment when the project does not require MFA, point 8) — both resolve to the
   same { userId, projectId } shape before reaching MfaService, so there is exactly
   one enroll/verify-enrollment code path, not two near-duplicates guarded
   differently. A request bearing neither is rejected the same way AccessTokenGuard
   already rejects a missing/invalid bearer elsewhere.

8. Voluntary self-service enrollment stays available even when project.mfa_required
   is false — a user can turn MFA on for their own account ahead of their project's
   policy via an access-token-authenticated call into the same
   enroll/verify-enrollment endpoints (point 7). Once enrolled, login always follows
   branch (b) above regardless of the project flag's later value — the user's own
   choice is respected even if an admin subsequently turns the project-wide
   requirement back off. This was a deliberate decision to keep the self-service
   path rather than gating enrollment entirely behind the project flag: the
   marginal cost is near zero once the enroll/verify machinery exists for the
   required case anyway.

9. Rate limiting: /auth/v1/mfa/verify gets the same strict per-route throttle as
   /auth/v1/login (§31 point 3 — a 6-digit TOTP code is a small enough space to be
   brute-forceable without this).

10. Admin-triggered reset: DELETE /admin/v1/users/:id/mfa (AdminSessionGuard)
    deletes the user's mfa_factors and mfa_backup_codes rows outright, for lockout
    recovery when a device and backup codes are both lost. If project.mfa_required
    is still true, this simply routes the user back through branch (c) — forced
    re-enrollment — on their next login, not back to a no-MFA state. Same trust
    level as every other admin user-management action (§5.1) — this console has no
    role/permission system to introduce a narrower one for (§29 point 6 already
    established this). Audited as admin.mfa_reset.

11. Self-service disable: DELETE /auth/v1/mfa (authenticated) requires the current
    password plus a valid TOTP/backup code as re-confirmation — disabling MFA is
    itself a sensitive action and shouldn't be possible from a bare authenticated
    session alone (e.g. a stolen access token with no factor of its own). If
    project.mfa_required is true, this endpoint still succeeds (a user is never
    permanently unable to remove their own factor), but their very next login
    immediately re-enters branch (c) — disabling is not a way to escape a project's
    policy, only a way to reset a broken enrollment.

12. Admin: a new PATCH /admin/v1/projects/:id/mfa-required {enabled} endpoint (there
    is no generic project-update endpoint yet — this platform's existing convention
    is narrow, purpose-built endpoints like API keys' /revoke and /reveal, not a
    general PATCH, so this follows that same shape) flips the flag, audited as
    admin.project_mfa_required_changed. The existing Users page gains an MFA status
    badge and a "Reset MFA" row action (§28 point 2's icon set) with a confirm
    modal; the Projects page gains the required-toggle itself. No new *end-user*
    enrollment UI in the admin console — the QR/verify screen is rendered by
    whatever frontend the project's own developer builds against the API, same
    boundary as every other phase (the admin console manages application users, it
    never role-plays as the tenant application's own frontend).
```

**Acceptance**: with a project's `mfa_required` off, a user can still voluntarily enroll (real
TOTP or `otplib`-computed code) and every subsequent login for that user returns `mfaRequired`
instead of tokens; flipping `mfa_required` on for a project does not affect an already-logged-in
user's live session, but the next fresh login for any of that project's *not-yet-enrolled* users
returns `mfaEnrollmentRequired` instead, and completing enroll→verify-enrollment in one flow
issues real tokens without a second `/mfa/verify` call; `mfa/verify` with an incorrect code is
rejected and enough incorrect attempts trigger Phase 17's rate limit; a backup code succeeds
exactly once and fails on reuse; an admin-triggered reset clears the factor and the user is
routed back through forced enrollment on next login if the project still requires it, or plain
password login if it doesn't.

---

# 34. PDF Generation Model

Phase 20. Backed by an external HTML→PDF API — wrap a hosted API rather than self-hosting a
renderer, the same shape as Phase 18's email choice — designed vendor-agnostically, with the
actual vendor selection deliberately deferred to a later, purely-configuration decision.

```text
1. PdfProvider interface: render(html: string, options?: { format?, margin?,
   timeoutMs? }) => Promise<Buffer>. A new PdfModule in control-server holds the
   interface and its adapters — structurally similar in spirit to the AI Gateway's
   own provider abstraction (§35), just a single-method surface instead of a whole
   request/response negotiation.

2. GenericHttpPdfProvider — the real, vendor-agnostic adapter, entirely
   config-driven: PDF_API_URL, PDF_API_AUTH_HEADER, PDF_API_AUTH_VALUE,
   PDF_API_HTML_FIELD (default "html"), and PDF_API_RESPONSE_MODE
   ("binary" | "json_url" | "json_base64", default "binary") — covering the three
   common response shapes hosted HTML→PDF APIs use (raw PDF bytes in the response
   body; a JSON body containing a downloadable URL; a JSON body containing
   base64-encoded bytes). Whichever vendor eventually gets chosen is very likely to
   fit one of these three shapes with zero code change, only env configuration —
   this is the concrete deliverable of "design provider-agnostic, pick vendor
   later."

3. MockPdfProvider — selected when PDF_PROVIDER=mock or when no PDF_API_URL is
   configured (the default out of the box). Returns a minimal valid single-page PDF
   byte buffer with no network call, sufficient to prove the whole path (Functions
   capability → provider → Storage write) end-to-end without committing to or
   paying for a real vendor account. Real vendor wiring is a deployment-time
   decision, not a code change.

4. Size/timeout/output caps: PDF_MAX_HTML_BYTES (input), PDF_TIMEOUT_MS,
   PDF_MAX_OUTPUT_BYTES (defends against a misbehaving vendor response) — same
   *_MAX_*_BYTES-style env convention as Storage (§21 point 6) and Hosting (§25
   point 3).

5. ctx.pdf.render(html, options?) Functions capability: goes through the same
   internal-callback pattern as ctx.secrets/ctx.email (a new POST
   /internal/pdf/render control-server endpoint, reusing the existing
   per-invocation opaque token) rather than letting function-runner call an
   external PDF vendor directly — function-runner holds no outbound credential of
   its own, and the vendor's auth header value should only ever live inside
   control-server's own process, mirroring §30 point 5's rationale for secrets.
   Returns a Buffer to the calling function's code.

6. ctx.pdf.renderToStorage(html, { bucket, path, options? }) — a convenience that
   renders then writes the resulting bytes through the existing internal
   storage-write path (reusing StorageService directly, no new upload mechanism),
   returning the resulting storage.objects row. This is the "bytes land in Storage
   through the existing storage-write path" design goal made concrete.

7. pdf.render_requests (id, project_id, status, duration_ms, output_bytes, error,
   created_at) — same audit/observability convention as functions.invocations /
   scheduler.job_runs.

8. No direct /pdf/v1/* REST endpoint in v1 — PDF generation is Functions-only,
   deliberately, since it composes naturally with a Function already assembling
   HTML from ctx.rest data, and a direct endpoint is an easy later addition if a
   concrete need for one shows up. This is a scoping choice, not an oversight.

9. Vendor credential scope: platform-level config (PDF_API_URL etc.), not a
   per-project Vault secret — a PDF-rendering credential is a shared platform cost
   center like Resend (Phase 18), not project-owned data the way an AI provider key
   is; Expansion 9 never asked for per-project vendor configurability the way the
   AI Gateway question explicitly did.

10. Explicit non-goals: no vendor selected or wired by default (point 3), no
    per-project vendor override (point 9), no PDF template system, no async/
    webhook-callback rendering mode — v1 is synchronous request/response only,
    bounded by PDF_TIMEOUT_MS.
```

**Acceptance**: with the default `MockPdfProvider`, a Function calling `ctx.pdf.render('<h1>hi</h1>')`
receives non-empty PDF-like bytes and a `pdf.render_requests` row is written;
`ctx.pdf.renderToStorage(...)` produces a real, downloadable `storage.objects` row containing
those bytes; switching `PDF_PROVIDER` to a real vendor requires only env-var changes when that
vendor's response shape matches one of `GenericHttpPdfProvider`'s three supported modes, no code
change.

---

# 35. AI Gateway Model

Phase 21. The most substantial of the five newly-promoted phases — genuine new architectural
surface, not a thin API wrapper like Phases 18/20. Provider-agnostic by design, with per-project
admin-configured provider selection: a core requirement (not a v1 shortcut) driven directly by
downstream-project need, so at least two real adapters ship in v1 rather than one — a
"configurable" choice with only one real option isn't actually configurable.

```text
1. AiProvider interface: complete(request: AiCompletionRequest) =>
   Promise<AiCompletionResponse>, where both request and response are a normalized
   common shape (messages array, model, maxTokens, temperature, optional
   responseFormat.jsonSchema) — never any one vendor's raw wire format leaking
   through this layer. Two concrete adapters ship in v1: AnthropicProvider and
   OpenAiProvider, each translating the common shape to/from that vendor's actual
   REST contract.

2. ai.provider_configs (id, project_id references platform.projects(id) on delete
   cascade, provider text check (provider in ('anthropic','openai')), model text,
   enabled boolean default true, created_at, updated_at), unique(project_id) — one
   active provider+model pair per project in v1 (switching providers means editing
   this row, not running two in parallel simultaneously) — the same "one active X
   per project" shape hosting.sites already uses (§25 point 2). model is free text,
   not a hardcoded enum, since providers ship new models faster than this platform
   should need a code deploy to allow one.

3. API key storage reuses the Secrets Vault (§30) rather than inventing a second
   encryption path: the admin console's AI config page writes the provider's API
   key as a vault secret under a reserved name, AI_PROVIDER_API_KEY, in that
   project's own vault namespace — same vault.secrets table, same libsodium
   primitive, same write-only-reveal semantics (§30 point 4: an admin sets it, no
   code path anywhere ever reads it back to the console). This makes Phase 21
   depend on Phase 16 (Vault, already shipped), and it's a real dependency, not
   just convention-following — there is no separate credential store for this
   phase to build.

4. Admin UI: /admin/ai/:project — a provider dropdown (Anthropic/OpenAI), a free-
   text model input, an API-key input reusing the Vault page's own write-only-
   secret-input component, and an enabled toggle. A requests-history view reading
   ai.requests (point 9) mirrors the Functions/Scheduler invocation-history pages.

5. Two call surfaces:

   a) POST /ai/v1/complete — AccessTokenGuard-protected (same trust level as
      /storage/v1/* and /functions/v1/*), project resolved from the caller's JWT
      project_id claim, no new header (§23 point 5's established convention).
      Body: { messages: [{role, content}], responseFormat?: { jsonSchema } } —
      provider and model are never caller-supplied; they always come from that
      project's ai.provider_configs row, so a caller can't force a different,
      possibly unconfigured or costlier provider/model than the project admin
      chose.

   b) ctx.ai.complete(request) Functions capability — the same internal-callback
      pattern as ctx.secrets/ctx.email/ctx.pdf (a new POST /internal/ai/complete
      endpoint, reusing the existing per-invocation opaque token), letting a
      Function combine ctx.rest data with an AI call in the same invocation — the
      explicit reason a Functions-side capability exists alongside the direct REST
      endpoint.

6. Structured-output validation: a request may include responseFormat.jsonSchema —
   a JSON Schema object, not a provider-specific "function calling" spec, kept
   provider-agnostic at this layer. control-server validates the provider's
   returned content against that schema using `ajv` (a small, dependency-light,
   widely-used JSON Schema validator — not zod, since a schema here needs to be
   storable/transmittable data traveling over HTTP and into prompt_templates rows,
   not TypeScript-authored code). A response that fails validation gets one
   automatic retry (point 8); if still invalid, a typed validation error is
   returned to the caller rather than passing through a document that silently
   violates its own requested shape.

7. Prompt/template versioning: ai.prompt_templates (id, project_id, name, template
   text, variables jsonb, created_at, updated_at), unique(project_id, name) —
   referenced from a completion request via { templateName, variables } instead of
   raw messages, so prompt text lives in the database and is editable from the
   admin console rather than hardcoded in Function source — the explicit design
   goal here. No version history in v1 (same overwrite-in-place convention as Vault
   secrets, §30 point 1); a later addition if real usage shows it's needed, not a
   v1 requirement.

8. Retries/timeouts: a single automatic retry on a transient provider error (5xx,
   timeout, or a schema-validation failure per point 6) with a fixed short backoff,
   then a typed error to the caller — no exponential-backoff queue or background
   job in v1, consistent with this platform's in-process/synchronous posture
   elsewhere (Scheduler §27, PDF §34). AI_REQUEST_TIMEOUT_MS is env-configurable,
   same convention as every other *_TIMEOUT_MS on this platform.

9. Cost/token metering: ai.requests (id, project_id, provider, model,
   prompt_tokens, completion_tokens, cost_estimate_usd, status, duration_ms, error,
   created_at) — same audit-table convention as functions.invocations /
   scheduler.job_runs. cost_estimate_usd is computed from a small hardcoded
   per-provider-per-model $/1K-token price table in code, updated by hand as
   vendor pricing changes — no live pricing-API integration in v1. A model missing
   from the table logs a null cost_estimate_usd rather than failing the request.

10. Feature-flag/policy layer: ai.provider_configs.enabled (point 2) is itself the
    v1 policy mechanism — a project with no enabled config gets a 404 from both
    call surfaces, "AI is off for this project" being the only policy granularity
    in v1. A finer-grained per-capability flag set (separately toggling e.g. raw
    completion vs. structured output vs. some future embeddings capability) is an
    explicit non-goal for v1 and the natural extension point once this needs more
    than one boolean.

11. Explicit non-goal: streaming. Both call surfaces are synchronous request/
    response only in v1. Streaming is very likely the largest single scope driver
    if added (a new transport — SSE or WebSocket, echoing Realtime's §22 own
    sibling-service reasoning — plus partial-response handling on both call
    surfaces) and is deliberately deferred rather than folded into this already-
    substantial phase.

12. Audit: ai.provider_config_saved via the existing AuthAuditService.record()
    convention, using a new ai.*-prefix (matching how every other subsystem —
    realtime.*, functions.*, hosting.*, vault.* — introduces its own event-type
    prefix rather than overloading admin.*).
```

**Acceptance**: configuring project A with `provider=anthropic` and project B with
`provider=openai` (each with its own vault-stored key) and calling `POST /ai/v1/complete`
against each returns a real completion from the correct, distinct provider, proving per-project
provider selection actually works; a request with a `responseFormat.jsonSchema` that the raw
provider response violates is either corrected by the single retry or returned as a typed
validation error, never passed through unvalidated; a successful call produces an `ai.requests`
row with non-null token counts and a cost estimate; a project with no `ai.provider_configs` row
gets a clean 404 from both `/ai/v1/complete` and `ctx.ai.complete`; a Function combining
`ctx.rest` (to fetch data) and `ctx.ai.complete` (to summarize it) in one invocation succeeds
end-to-end.

---

[9]: https://min.io/docs/minio/linux/index.html "MinIO Object Storage Documentation"

[1]: https://supabase.com/docs/guides/api?utm_source=chatgpt.com "Data REST API - Supabase Docs"
[2]: https://supabase.com/docs/guides/api/creating-routes?utm_source=chatgpt.com "Creating API Routes - Supabase Docs"
[3]: https://docs.postgrest.org/en/stable/references/api/schemas.html?utm_source=chatgpt.com "Schemas — PostgREST 14 documentation"
[4]: https://supabase.com/docs/guides/database/joins-and-nesting?utm_source=chatgpt.com "Querying Joins and Nested tables - Supabase Docs"
[5]: https://supabase.com/docs/guides/auth/jwts?utm_source=chatgpt.com "JSON Web Token (JWT) | Supabase Docs"
[6]: https://supabase.com/docs/guides/api/securing-your-api?utm_source=chatgpt.com "Securing your API - Supabase Docs"
[7]: https://docs.postgrest.org/en/stable/references/schema_cache.html?utm_source=chatgpt.com "Schema Cache — PostgREST 14 documentation"
[8]: https://www.postgresql.org/docs/current/event-triggers.html?utm_source=chatgpt.com "PostgreSQL: Documentation: 18: Chapter 38. Event Triggers"

