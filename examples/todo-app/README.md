# Todo App — personal-baas example

A standalone reference client that exercises the full public HTTP API of a personal-baas
deployment — Auth (register/login), REST (todo CRUD via a row-level-secured `api.todos` table),
and Storage (file attach/download/remove) — using nothing but plain HTML/CSS/JS and jQuery, no
build step, no internal code.

## One-time setup (per deployment)

Do these once against a running personal-baas stack, then never touch anything but `config.js`.

1. **Start the stack** (from the repo root): `docker compose -f infrastructure/docker/docker-compose.yml up -d`
2. **Create the schema**: open `/admin/sql` in the admin console, paste the contents of
   [`schema.sql`](./schema.sql), and execute it. This creates `api.todos` with owner-only RLS —
   it's never migrated by tooling, per this project's `api`/`private` schema convention.
3. **Create the storage bucket**: open `/admin/storage` and create a bucket named
   `todo-attachments` (any public/private setting works — this app only ever accesses its own
   or its own user's attachments, never relying on public-read).
4. **Mint a publishable key**: open `/admin/api-keys`, create a key of kind `publishable`, and
   copy the token.

## Running the app

1. Copy this `examples/todo-app/` directory anywhere you like.
2. Edit `config.js` — set `baseUrl` to your deployment's public URL (e.g. `http://localhost:8000`)
   and `anonKey` to the publishable key from step 4 above. This is the **only** file you edit.
3. Open `index.html` directly in a browser. No server required — the app talks to your
   personal-baas deployment over plain `fetch()` calls, and both the control-server and PostgREST
   already send CORS headers permissive enough for a `file://` page to call them. If your browser
   still blocks it, serve the directory with any static file server instead, e.g.
   `python3 -m http.server` from inside `examples/todo-app/`.
4. Register a user, log in, add/toggle/delete todos, and attach/download/remove a file on any
   todo.

## How it works

- `js/api.js` is the only file that talks to the network — a thin `fetch` wrapper around
  `/auth/v1/*`, `/rest/v1/todos`, and `/storage/v1/object/todo-attachments/*path`. One
  `Authorization: Bearer <token>` header throughout: the publishable key before login, the
  session's access token after (auto-refreshed on a `401` via `/auth/v1/token`).
- `js/app.js` is jQuery-driven DOM/UI wiring only — it never calls `fetch` directly.
- Access control for todos comes entirely from Postgres row-level security (RLS) on `api.todos`,
  not from any application logic in this app. Access control for attachments comes from the
  storage module's ownership check (uploader's JWT `sub` vs. the stored object's owner).
