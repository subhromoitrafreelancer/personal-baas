# ATS — personal-baas example app

A recruitment hierarchy/workflow application (Client → BDE → Department → Team Lead → Senior
Team Lead → Recruiter → Candidate), built as a full React/shadcn frontend on top of
personal-baas's own Auth, REST/RLS, and RPC primitives — no bespoke backend of its own. Runs as
its own project (schema `api_ats`, Phase 9 multi-project — scope.md §23), so it never touches the
default project's data.

Unlike `examples/todo-app` (plain HTML/JS, zero build step), this app has its own real build
system (Vite + React + TypeScript + Tailwind + shadcn/ui) and is a linked npm workspace member, so
it imports `@personal-baas/client-sdk` as a real typed package rather than vendoring fetch code.

See the [dev plan](../../.claude/plans/) this was built from for the full architecture writeup
(schema design, RLS policies, RPC functions, phase breakdown).

## One-time setup (per deployment)

1. **Start the stack** (from the repo root): `npm run compose:up`
2. **Create the `ats` project**: open `/admin/projects`, create a project with slug `ats`.
3. **Restart PostgREST** so it picks up the new schema: `docker compose --env-file .env -f infrastructure/docker/docker-compose.yml restart postgrest` — manual step by design (scope.md §23).
4. **Run the schema**: open `/admin/sql`, select the `ats` project, paste the contents of
   [`schema.sql`](./schema.sql), and execute it. (It's written to be re-run in full against a
   fresh `ats` project — each `== Phase N ==` section was originally run separately as that part
   of the app was built.)
5. **Mint a publishable key**: open `/admin/api-keys`, select the `ats` project, create a key of
   kind `publishable`, and copy the token.
6. **Create the resumes bucket**: open `/admin/storage` and create a bucket named `ats-resumes`,
   marked **public**. See "Storage's access-control gap" below for why it has to be public.

## Running the app

1. `cp .env.example .env.local` and fill in `VITE_BAAS_URL` + `VITE_BAAS_ANON_KEY` (the key from
   step 5 above). `VITE_BAAS_SCHEMA` should stay `api_ats`.
2. From the repo root: `npm install` (this app is a workspace member, so a root install covers it).
3. `npm run dev --workspace examples/ats-app` (or `cd examples/ats-app && npm run dev`) — starts
   the Vite dev server on `http://localhost:5174`.
4. Register the **first** account — it's automatically promoted to `ADMIN` (see
   `api_ats.bootstrap_profile` in `schema.sql`). Every account after that lands on a
   pending-approval screen until the admin assigns it a role and department from the Admin
   screens (departments/users management — Phase 2).

## How it works

- All business logic that needs to be trustworthy (role/department checks, the recruitment
  workflow's state machine) lives in Postgres — row-level security policies plus two
  `security definer` RPC functions (`create_application`, `transition_application`) — not in the
  frontend. The frontend calls generated REST/RPC endpoints through `@personal-baas/client-sdk`;
  it never encodes an authorization decision itself.
- `src/providers/auth-provider.tsx` is the one place that owns the session + the caller's own
  `profiles` row (role, department). Every screen reads role/department from there, never from a
  separate fetch.
- Design system: warm paper background, an ochre "highlighter" accent, Fraunces for page titles,
  IBM Plex Sans for dense UI text, IBM Plex Mono for system-generated identifiers (codes, IDs,
  timestamps) — see `src/index.css`.

## Storage's access-control gap

Resumes (`api_ats.documents`, Phase 5) are stored via this platform's Storage module, which has
no row-level-security or per-object ACL concept — `StorageService.canRead`/`canWrite` only know
two access levels: fully public, or owner-only. There's no way to express "readable by any ATS
staff member" without changing platform code (a project- or role-scoped bucket ACL), which was
judged out of scope for an example app touching shared platform code.

The `ats-resumes` bucket is therefore **public**: any authenticated user on the deployment can
download a resume's bytes if they know its `storage_path` — not just ATS staff, and not scoped to
this project, since Storage buckets aren't project-scoped either (same shared-namespace caveat
called out in `examples/todo-app/README.md`). `api_ats.documents`'s own RLS still correctly scopes
who can *see that a document exists and get its path* to the same audience who can see the
candidate — it's only the raw byte-fetch endpoint that's wide open. Uploads and deletes are
restricted to the candidate's owning recruiter at the app layer (`documents` RLS), and deletes are
further enforced at the storage layer itself (owner-only `canWrite`) — verified in this phase's
smoke test that a non-owner's delete attempt gets a `403`.

If resumes need to stay genuinely staff-only, that requires a platform change (e.g. teaching
`StorageService` to consult a caller-supplied scope/role instead of just owner-or-public), not
something expressible from this app's own schema.
