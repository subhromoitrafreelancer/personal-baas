// Reusable RLS templates for the SQL editor's snippet picker (Phase 4.2). Table/column names
// are left as <angle-bracket> placeholders for the developer to find-and-replace — these are
// starting points, not parameterized generators, since the right column names/ownership model
// vary per table. Each snippet pairs its policies with the GRANTs it needs: a policy without a
// matching table-level grant is a no-op (scope.md §9 — grants are never automatic), so leaving
// the GRANT out is a common trap these snippets are written to avoid.
export const RLS_SNIPPETS = {
  'owner-only': `-- Owner-only access: each row is visible/writable only by the user who owns it.
-- Requires the table to have a "user_id uuid" column (references auth.users(id) recommended).
alter table api.<table_name> enable row level security;

create policy "select_own_rows" on api.<table_name>
  for select to authenticated
  using (user_id = auth.uid());

create policy "insert_own_rows" on api.<table_name>
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "update_own_rows" on api.<table_name>
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete_own_rows" on api.<table_name>
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on api.<table_name> to authenticated;
`,

  'public-read-auth-write': `-- Public read, authenticated write: anyone (including anon/unauthenticated callers) can
-- read every row; only logged-in users can create or modify rows.
alter table api.<table_name> enable row level security;

create policy "public_read" on api.<table_name>
  for select to anon, authenticated
  using (true);

create policy "authenticated_write" on api.<table_name>
  for insert to authenticated
  with check (true);

create policy "authenticated_update" on api.<table_name>
  for update to authenticated
  using (true)
  with check (true);

create policy "authenticated_delete" on api.<table_name>
  for delete to authenticated
  using (true);

grant select on api.<table_name> to anon;
grant select, insert, update, delete on api.<table_name> to authenticated;
`,

  'admin-only': `-- Admin-only access: only the secret API key (service_role, which has BYPASSRLS) may read
-- or write this table. No grants to anon or authenticated -- ordinary users get no access at
-- all, and leaving RLS enabled with zero policies for them enforces that even if a grant is
-- added later by mistake.
alter table api.<table_name> enable row level security;

grant select, insert, update, delete on api.<table_name> to service_role;
`,

  'authenticated-crud': `-- Authenticated CRUD: any logged-in user can read/write every row -- no per-row ownership
-- restriction. anon has no access at all.
alter table api.<table_name> enable row level security;

create policy "authenticated_all" on api.<table_name>
  for all to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on api.<table_name> to authenticated;
`,
};
