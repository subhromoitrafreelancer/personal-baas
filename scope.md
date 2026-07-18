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

Edge/serverless functions, also originally excluded, are promoted to a real phase (§17 Phase 12) now that Phase 9's multi-project model exists to scope functions to — see §26. Static hosting and a job scheduler were not part of the original exclusion list at all; they're new, later additions covered by §25 and §27. Separately, storage's per-project isolation is being retrofitted in §17 Phase 10 to close a gap Phase 7 shipped before Phase 9's project model existed — see §24.

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
* API explorer
* Copyable JavaScript examples
* Copyable cURL examples
* Project environment file generation
* Installation and deployment guide

(The sample application originally planned here was built ahead of schedule as Phase 7a's example todo app — directly against REST/Auth/Storage, since it also needed to demonstrate Storage.)

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
* Code-execution sandbox strategy is an open decision, not yet made — see §26 point 5

See §26 Functions Model for the full design.

## Phase 13 — Scheduler

### Features

* Cron-scheduled invocation of Phase 12 functions, run with `service_role`-level trust
* In-process timer loop — no OS cron, no `pg_cron`, no new sibling service
* Single-instance limitation, same caveat shape as Phase 8 Realtime's

Depends on Phase 12 — a scheduled job's unit of work is a function invocation, not a separate execution primitive. See §27 Scheduler Model for the full design.

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
* MFA
* Organizations and memberships
* Custom JWT claims

## Expansion 5: GraphQL

* Add a GraphQL layer using an existing PostgreSQL-aware engine
* Do not implement GraphQL schema generation manually

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
Phase 9's project model exists to scope functions to. **The code-execution sandbox is the one
genuinely open decision in this section — see point 5; the rest of this design (schema,
invocation contract, API surface) holds regardless of which sandbox option is chosen.**

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

5. OPEN DECISION — sandbox strategy. All three options below keep the
   invocation contract in point 3 identical; they differ in isolation
   strength, operational cost, and how far each reopens the precedent §23
   point 7 already set (Docker-socket access into control-server was
   considered and explicitly rejected as too large an attack surface, for a
   feature far lower-stakes than arbitrary code execution).

   a) In-process V8 isolate (e.g. `isolated-vm`, or Node's built-in `vm`
      module with a curated global scope). No new service, no Docker socket,
      no new container lifecycle to operate. Isolation is resource/CPU/
      memory-limit enforcement, not a hard security boundary. Fits this
      platform's actual current trust model — a single admin who manages
      every project (§23 point 8) and already has unrestricted SQL access via
      the admin console (§5.2) — under which sandboxing beyond resource
      limits is arguably no more necessary for functions than it is for the
      SQL console today.

   b) Separate function-runner sibling process (a new service using Node
      worker_threads with a restricted global scope, talking to
      control-server over an internal API — same "new sibling service" shape
      as postgrest/minio in docker-compose.yml). Contains a crash or resource
      exhaustion to one process rather than all of control-server, without
      real container isolation. More operational surface than (a): a new
      service to build, deploy, and keep healthy.

   c) Per-invocation container (Docker, or a stronger primitive like gVisor/
      Firecracker). Real isolation — the right answer if function authors
      across projects are ever *mutually untrusted* (a genuine multi-tenant
      SaaS posture). Directly reopens the Docker-socket question §23 point 7
      closed for a much smaller feature (restarting PostgREST); revisiting it
      here needs its own explicit decision, not an implicit one made by
      picking this option. Also the slowest cold start and heaviest
      operational lift of the three.

   Recommendation if forced to pick today: (a) — it matches this platform's
   actual current trust model exactly and adds zero new infrastructure. But
   this depends entirely on one premise holding: that function authors are
   always the same trusted platform operator, never a less-trusted third
   party. If that premise might not hold, (a) is the wrong choice and this
   needs revisiting before Phase 12 starts.

6. Admin UI: /admin/functions/:project — list, create/edit (reuses the SQL
   editor's vendored CodeMirror 6 setup with a JS/TS language mode instead of
   SQL), a test-invoke panel (arbitrary JSON body + view response), and an
   invocation history view reading functions.invocations.
```

**Acceptance**: a function reading ctx.auth.sub and calling ctx.rest returns different data
for two different users' JWTs, each seeing only what their own JWT could already read
directly via /rest/v1/* (proving point 3's isolation property); a project-A JWT invoking a
project-B function 404s.

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
```

**Acceptance**: a function that writes a timestamp row via ctx.rest, scheduled at a short
interval via the admin UI, produces matching scheduler.job_runs and function-owned rows
unattended over several minutes with no invoking JWT involved; disabling the job stops it
firing.

[9]: https://min.io/docs/minio/linux/index.html "MinIO Object Storage Documentation"

[1]: https://supabase.com/docs/guides/api?utm_source=chatgpt.com "Data REST API - Supabase Docs"
[2]: https://supabase.com/docs/guides/api/creating-routes?utm_source=chatgpt.com "Creating API Routes - Supabase Docs"
[3]: https://docs.postgrest.org/en/stable/references/api/schemas.html?utm_source=chatgpt.com "Schemas — PostgREST 14 documentation"
[4]: https://supabase.com/docs/guides/database/joins-and-nesting?utm_source=chatgpt.com "Querying Joins and Nested tables - Supabase Docs"
[5]: https://supabase.com/docs/guides/auth/jwts?utm_source=chatgpt.com "JSON Web Token (JWT) | Supabase Docs"
[6]: https://supabase.com/docs/guides/api/securing-your-api?utm_source=chatgpt.com "Securing your API - Supabase Docs"
[7]: https://docs.postgrest.org/en/stable/references/schema_cache.html?utm_source=chatgpt.com "Schema Cache — PostgREST 14 documentation"
[8]: https://www.postgresql.org/docs/current/event-triggers.html?utm_source=chatgpt.com "PostgreSQL: Documentation: 18: Chapter 38. Event Triggers"

