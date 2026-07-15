-- examples/todo-app/schema.sql
--
-- Run this once by hand through /admin/sql (see README.md) — api/private schemas are always
-- developer-driven via the SQL editor, never migrated by tooling (docs/implementation-plan.md).
--
-- RLS policies below are the "owner-only" template from
-- apps/control-server/src/admin-ui/public/js/rls-snippets.js, with <table_name> -> todos.

create table api.todos (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null,
    done boolean not null default false,
    attachment_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table api.todos enable row level security;

create policy "select_own_rows" on api.todos
  for select to authenticated
  using (user_id = auth.uid());

create policy "insert_own_rows" on api.todos
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "update_own_rows" on api.todos
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "delete_own_rows" on api.todos
  for delete to authenticated
  using (user_id = auth.uid());

-- RLS restricts rows, but table-level access is never granted automatically (scope.md §9:
-- "anon: No access unless explicitly granted") — a policy without this grant is a common trap.
grant select, insert, update, delete on api.todos to authenticated;
