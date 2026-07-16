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

[9]: https://min.io/docs/minio/linux/index.html "MinIO Object Storage Documentation"

[1]: https://supabase.com/docs/guides/api?utm_source=chatgpt.com "Data REST API - Supabase Docs"
[2]: https://supabase.com/docs/guides/api/creating-routes?utm_source=chatgpt.com "Creating API Routes - Supabase Docs"
[3]: https://docs.postgrest.org/en/stable/references/api/schemas.html?utm_source=chatgpt.com "Schemas — PostgREST 14 documentation"
[4]: https://supabase.com/docs/guides/database/joins-and-nesting?utm_source=chatgpt.com "Querying Joins and Nested tables - Supabase Docs"
[5]: https://supabase.com/docs/guides/auth/jwts?utm_source=chatgpt.com "JSON Web Token (JWT) | Supabase Docs"
[6]: https://supabase.com/docs/guides/api/securing-your-api?utm_source=chatgpt.com "Securing your API - Supabase Docs"
[7]: https://docs.postgrest.org/en/stable/references/schema_cache.html?utm_source=chatgpt.com "Schema Cache — PostgREST 14 documentation"
[8]: https://www.postgresql.org/docs/current/event-triggers.html?utm_source=chatgpt.com "PostgreSQL: Documentation: 18: Chapter 38. Event Triggers"

