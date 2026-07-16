// Reusable RLS templates for the SQL editor's snippet picker (Phase 4.2). Table/column names
// are left as <angle-bracket> placeholders for the developer to find-and-replace — these are
// starting points, not parameterized generators, since the right column names/ownership model
// vary per table. Each snippet pairs its policies with the GRANTs it needs: a policy without a
// matching table-level grant is a no-op (scope.md §9 — grants are never automatic), so leaving
// the GRANT out is a common trap these snippets are written to avoid.
//
// Schema and role names are NOT left as manual placeholders, unlike table/column names — they're
// auto-filled from the SQL editor's project selector (schemaName, and anon/authenticated/
// service_role role names, which are project-scoped past the default project — scope.md §23).
// A snippet hardcoding `api.<table_name>`/`to authenticated` would silently target the *default*
// project's schema and shared role names even while a different project is selected, since an
// explicitly schema-qualified statement always overrides the SQL console's search_path — caught
// live during Phase 9 compatibility validation of the realtime feature. Each snippet is
// therefore a function of (schemaName, roles), not a plain string; sql-editor.js calls it with
// the currently selected project's values.
export const DEFAULT_SNIPPET_ROLES = { anon: 'anon', authenticated: 'authenticated', serviceRole: 'service_role' };

export const RLS_SNIPPETS = {
  'owner-only': (schemaName = 'api', roles = DEFAULT_SNIPPET_ROLES) => `-- Owner-only access: each row is visible/writable only by the user who owns it.
-- Requires the table to have a "user_id uuid" column (references auth.users(id) recommended).
alter table ${schemaName}.<table_name> enable row level security;

create policy "select_own_rows" on ${schemaName}.<table_name>
  for select to ${roles.authenticated}
  using (user_id = auth.uid());

create policy "insert_own_rows" on ${schemaName}.<table_name>
  for insert to ${roles.authenticated}
  with check (user_id = auth.uid());

create policy "update_own_rows" on ${schemaName}.<table_name>
  for update to ${roles.authenticated}
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete_own_rows" on ${schemaName}.<table_name>
  for delete to ${roles.authenticated}
  using (user_id = auth.uid());

grant select, insert, update, delete on ${schemaName}.<table_name> to ${roles.authenticated};
`,

  'public-read-auth-write': (schemaName = 'api', roles = DEFAULT_SNIPPET_ROLES) => `-- Public read, authenticated write: anyone (including anon/unauthenticated callers) can
-- read every row; only logged-in users can create or modify rows.
alter table ${schemaName}.<table_name> enable row level security;

create policy "public_read" on ${schemaName}.<table_name>
  for select to ${roles.anon}, ${roles.authenticated}
  using (true);

create policy "authenticated_write" on ${schemaName}.<table_name>
  for insert to ${roles.authenticated}
  with check (true);

create policy "authenticated_update" on ${schemaName}.<table_name>
  for update to ${roles.authenticated}
  using (true)
  with check (true);

create policy "authenticated_delete" on ${schemaName}.<table_name>
  for delete to ${roles.authenticated}
  using (true);

grant select on ${schemaName}.<table_name> to ${roles.anon};
grant select, insert, update, delete on ${schemaName}.<table_name> to ${roles.authenticated};
`,

  'admin-only': (schemaName = 'api', roles = DEFAULT_SNIPPET_ROLES) => `-- Admin-only access: only the secret API key (service_role, which has BYPASSRLS) may read
-- or write this table. No grants to anon or authenticated -- ordinary users get no access at
-- all, and leaving RLS enabled with zero policies for them enforces that even if a grant is
-- added later by mistake.
alter table ${schemaName}.<table_name> enable row level security;

grant select, insert, update, delete on ${schemaName}.<table_name> to ${roles.serviceRole};
`,

  'authenticated-crud': (schemaName = 'api', roles = DEFAULT_SNIPPET_ROLES) => `-- Authenticated CRUD: any logged-in user can read/write every row -- no per-row ownership
-- restriction. anon has no access at all.
alter table ${schemaName}.<table_name> enable row level security;

create policy "authenticated_all" on ${schemaName}.<table_name>
  for all to ${roles.authenticated}
  using (true)
  with check (true);

grant select, insert, update, delete on ${schemaName}.<table_name> to ${roles.authenticated};
`,
};
