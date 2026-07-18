-- examples/ats-app/schema.sql
--
-- Run this by hand through /admin/sql against the `ats` project (see README.md) -- api_ats is
-- always developer-driven via the SQL editor, never migrated by tooling, same convention as
-- examples/todo-app/schema.sql. Grown incrementally: each "== Phase N ==" section below was
-- appended and run separately as that phase of the app was built; re-running the whole file
-- against a fresh `ats` project from scratch also works end-to-end.
--
-- Shared helper pattern used throughout: api_ats.current_role() / api_ats.current_department(),
-- two `stable security definer` functions that look up the caller's own profiles row. RLS
-- policies below call these instead of re-deriving role/department inline -- this also sidesteps
-- RLS self-recursion on profiles, since a security definer function bypasses the caller's own
-- RLS when it queries profiles internally.

-- ============================================================
-- == Phase 1 -- Foundation: departments, profiles, identity bootstrap
-- ============================================================

create table api_ats.departments (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    code       text not null unique,
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table api_ats.profiles (
    user_id       uuid primary key references auth.users(id) on delete cascade,
    email         text not null,
    full_name     text not null default '',
    role          text check (role in ('ADMIN','BDE','TL','STL','RECRUITER')),
    department_id uuid references api_ats.departments(id) on delete set null,
    active        boolean not null default true,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
comment on column api_ats.profiles.role is
  'NULL means "signed up, not yet approved" -- the app shows a pending-approval screen until an ADMIN assigns a role.';

create or replace function api_ats.current_role() returns text
language sql stable security definer set search_path = api_ats, pg_temp as $$
  select role from api_ats.profiles where user_id = auth.uid();
$$;

create or replace function api_ats.current_department() returns uuid
language sql stable security definer set search_path = api_ats, pg_temp as $$
  select department_id from api_ats.profiles where user_id = auth.uid();
$$;

grant execute on function api_ats.current_role() to authenticated_ats;
grant execute on function api_ats.current_department() to authenticated_ats;

-- First signed-up user becomes ADMIN; everyone after starts unassigned (role = null). Called by
-- the frontend once, right after signup+login. security definer so authenticated_ats needs no
-- direct INSERT grant on profiles at all -- profile creation only ever happens here.
create or replace function api_ats.bootstrap_profile(p_full_name text default '')
returns api_ats.profiles
language plpgsql security definer set search_path = api_ats, pg_temp as $$
declare
  v_profile  api_ats.profiles;
  v_email    text;
  v_is_first boolean;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'no authenticated user';
  end if;

  select not exists (select 1 from api_ats.profiles) into v_is_first;

  insert into api_ats.profiles (user_id, email, full_name, role)
  values (auth.uid(), v_email, p_full_name, case when v_is_first then 'ADMIN' else null end)
  on conflict (user_id) do update set email = excluded.email
  returning * into v_profile;

  return v_profile;
end;
$$;

grant execute on function api_ats.bootstrap_profile(text) to authenticated_ats;

-- Column-level protection: a non-admin may update their own row (e.g. full_name) but never
-- their own role/department/active -- enforced via trigger since a single RLS WITH CHECK can't
-- compare NEW against OLD.
create or replace function api_ats.protect_profile_privileged_columns()
returns trigger language plpgsql security definer set search_path = api_ats, pg_temp as $$
begin
  if api_ats.current_role() is distinct from 'ADMIN' then
    if new.role is distinct from old.role
       or new.department_id is distinct from old.department_id
       or new.active is distinct from old.active then
      raise exception 'only an ADMIN may change role, department, or active status';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_privileged_columns
before update on api_ats.profiles
for each row execute function api_ats.protect_profile_privileged_columns();

alter table api_ats.departments enable row level security;
create policy "read_all_authenticated" on api_ats.departments
  for select to authenticated_ats using (true);
create policy "admin_write" on api_ats.departments
  for all to authenticated_ats
  using (api_ats.current_role() = 'ADMIN')
  with check (api_ats.current_role() = 'ADMIN');
grant select, insert, update, delete on api_ats.departments to authenticated_ats;

alter table api_ats.profiles enable row level security;
create policy "select_own_or_admin" on api_ats.profiles
  for select to authenticated_ats
  using (user_id = auth.uid() or api_ats.current_role() = 'ADMIN');
create policy "update_own_or_admin" on api_ats.profiles
  for update to authenticated_ats
  using (user_id = auth.uid() or api_ats.current_role() = 'ADMIN')
  with check (user_id = auth.uid() or api_ats.current_role() = 'ADMIN');
grant select, update on api_ats.profiles to authenticated_ats;
-- deliberately no insert grant -- profile rows are only ever created via bootstrap_profile()

-- ============================================================
-- == Phase 3 -- BDE flow: clients, requirements, job positions, assignments
-- ============================================================

-- Assigning a TL to a job (BDE) or a recruiter to a job (TL) requires looking up candidates by
-- role -- the Phase 1 profiles policy only allows reading your own row or, if you're an ADMIN,
-- everyone's. Widen read access to a "staff directory" for the roles that need to look people up
-- for assignment purposes (mirrors the original plan's `GET /users?role=&departmentId=`,
-- accessible to BDE/TL/STL/ADMIN); RECRUITER still only ever sees their own row via the existing
-- policy. Additive -- permissive policies OR together, so this only ever broadens access.
create policy "staff_directory_read" on api_ats.profiles
  for select to authenticated_ats
  using (api_ats.current_role() in ('BDE', 'TL', 'STL'));

create table api_ats.clients (
    id             uuid primary key default gen_random_uuid(),
    name           text not null,
    contact_person text,
    email          text not null,
    phone          text,
    active         boolean not null default true,
    created_at     timestamptz not null default now()
);

create table api_ats.requirements (
    id                 uuid primary key default gen_random_uuid(),
    client_id          uuid not null references api_ats.clients(id),
    job_title          text not null,
    skills             text,
    exp_min_years      int,
    exp_max_years      int,
    location           text,
    salary_min         numeric(12,2),
    salary_max         numeric(12,2),
    salary_currency    text not null default 'INR',
    number_of_openings int not null default 1,
    notes              text,
    -- default auth.uid() -- populated server-side, not sent by the client (also means it can't
    -- be spoofed to attribute a requirement to someone else).
    created_by         uuid not null default auth.uid() references api_ats.profiles(user_id),
    created_at         timestamptz not null default now()
);

create table api_ats.job_positions (
    id             uuid primary key default gen_random_uuid(),
    requirement_id uuid references api_ats.requirements(id),
    department_id  uuid not null references api_ats.departments(id),
    title          text not null,
    description    text,
    status         text not null default 'OPEN'
                     check (status in ('OPEN','IN_PROGRESS','FILLED','CANCELLED')),
    assigned_tl_id uuid references api_ats.profiles(user_id),
    openings       int not null default 1,
    created_by     uuid not null default auth.uid() references api_ats.profiles(user_id),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now()
);

create table api_ats.recruiter_assignments (
    id              uuid primary key default gen_random_uuid(),
    job_position_id uuid not null references api_ats.job_positions(id),
    recruiter_id    uuid not null references api_ats.profiles(user_id),
    assigned_at     timestamptz not null default now(),
    unique (job_position_id, recruiter_id)
);

-- clients/requirements: BDE/ADMIN only (no other role needs these directly -- TL/Recruiter work
-- off job_positions, which already carries title/description).
alter table api_ats.clients enable row level security;
create policy "bde_admin_all" on api_ats.clients
  for all to authenticated_ats
  using (api_ats.current_role() in ('BDE','ADMIN'))
  with check (api_ats.current_role() in ('BDE','ADMIN'));
grant select, insert, update, delete on api_ats.clients to authenticated_ats;

alter table api_ats.requirements enable row level security;
create policy "bde_admin_all" on api_ats.requirements
  for all to authenticated_ats
  using (api_ats.current_role() in ('BDE','ADMIN'))
  with check (api_ats.current_role() in ('BDE','ADMIN'));
grant select, insert, update, delete on api_ats.requirements to authenticated_ats;

alter table api_ats.job_positions enable row level security;
create policy "bde_admin_full" on api_ats.job_positions
  for all to authenticated_ats
  using (api_ats.current_role() in ('BDE','ADMIN'))
  with check (api_ats.current_role() in ('BDE','ADMIN'));
create policy "dept_scoped_read" on api_ats.job_positions
  for select to authenticated_ats
  using (department_id = api_ats.current_department());
create policy "tl_update_own_dept" on api_ats.job_positions
  for update to authenticated_ats
  using (api_ats.current_role() = 'TL' and department_id = api_ats.current_department())
  with check (api_ats.current_role() = 'TL' and department_id = api_ats.current_department());
grant select, insert, update, delete on api_ats.job_positions to authenticated_ats;

alter table api_ats.recruiter_assignments enable row level security;
create policy "bde_admin_full" on api_ats.recruiter_assignments
  for all to authenticated_ats
  using (api_ats.current_role() in ('BDE','ADMIN'))
  with check (api_ats.current_role() in ('BDE','ADMIN'));
create policy "tl_manage_own_dept" on api_ats.recruiter_assignments
  for all to authenticated_ats
  using (api_ats.current_role() = 'TL' and exists (
    select 1 from api_ats.job_positions jp
    where jp.id = job_position_id and jp.department_id = api_ats.current_department()))
  with check (api_ats.current_role() = 'TL' and exists (
    select 1 from api_ats.job_positions jp
    where jp.id = job_position_id and jp.department_id = api_ats.current_department()));
create policy "recruiter_read_own" on api_ats.recruiter_assignments
  for select to authenticated_ats using (recruiter_id = auth.uid());
grant select, insert, update, delete on api_ats.recruiter_assignments to authenticated_ats;

-- ============================================================
-- == Phase 4 -- Core workflow: candidates, applications, workflow engine
-- ============================================================

create table api_ats.candidates (
    id                      uuid primary key default gen_random_uuid(),
    full_name               text not null,
    email                   text,
    phone                   text,
    current_location        text,
    skills                  text,
    experience_years        int,
    -- default auth.uid() -- candidates are inserted directly by the client (unlike
    -- applications, which only ever go through create_application()), so this needs the same
    -- server-populated default as requirements.created_by / job_positions.created_by.
    created_by_recruiter_id uuid not null default auth.uid() references api_ats.profiles(user_id),
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create table api_ats.applications (
    id                   uuid primary key default gen_random_uuid(),
    candidate_id         uuid not null references api_ats.candidates(id),
    job_position_id      uuid not null references api_ats.job_positions(id),
    recruiter_id         uuid not null references api_ats.profiles(user_id),
    workflow_instance_id uuid,
    created_at           timestamptz not null default now(),
    unique (candidate_id, job_position_id)
);

create table api_ats.workflow_definitions (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    active     boolean not null default true,
    created_at timestamptz not null default now()
);

create table api_ats.workflow_states (
    id            uuid primary key default gen_random_uuid(),
    definition_id uuid not null references api_ats.workflow_definitions(id),
    state_name    text not null,
    label         text not null,
    is_initial    boolean not null default false,
    is_final      boolean not null default false,
    display_order int not null default 0,
    unique (definition_id, state_name)
);

create table api_ats.workflow_transitions (
    id              uuid primary key default gen_random_uuid(),
    definition_id   uuid not null references api_ats.workflow_definitions(id),
    from_state      text not null,
    to_state        text not null,
    transition_name text not null,
    allowed_roles   text[] not null,
    requires_note   boolean not null default false,
    display_label   text,
    unique (definition_id, from_state, transition_name)
);

create table api_ats.workflow_instances (
    id            uuid primary key default gen_random_uuid(),
    definition_id uuid not null references api_ats.workflow_definitions(id),
    entity_type   text not null default 'APPLICATION',
    entity_id     uuid not null,
    current_state text not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (entity_type, entity_id)
);

create table api_ats.workflow_transition_logs (
    id           uuid primary key default gen_random_uuid(),
    instance_id  uuid not null references api_ats.workflow_instances(id),
    from_state   text not null,
    to_state     text not null,
    performed_by uuid not null references api_ats.profiles(user_id),
    performed_at timestamptz not null default now(),
    note         text
);

-- Seed: single "Standard Recruitment" definition covering the BDE->TL->STL->Finalized handoff
-- chain (CLIENT role dropped -- not part of the v1 role set).
insert into api_ats.workflow_definitions (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Standard Recruitment');

insert into api_ats.workflow_states (definition_id, state_name, label, is_initial, is_final, display_order) values
  ('aaaaaaaa-0000-0000-0000-000000000001','SOURCED','Sourced',true,false,1),
  ('aaaaaaaa-0000-0000-0000-000000000001','SUBMITTED_TO_TL','Submitted to TL',false,false,2),
  ('aaaaaaaa-0000-0000-0000-000000000001','TL_APPROVED','TL Approved',false,false,3),
  ('aaaaaaaa-0000-0000-0000-000000000001','TL_REJECTED','TL Rejected',false,false,4),
  ('aaaaaaaa-0000-0000-0000-000000000001','SUBMITTED_TO_STL','Submitted to STL',false,false,5),
  ('aaaaaaaa-0000-0000-0000-000000000001','STL_APPROVED','STL Approved',false,false,6),
  ('aaaaaaaa-0000-0000-0000-000000000001','STL_REJECTED','STL Rejected',false,true,7),
  ('aaaaaaaa-0000-0000-0000-000000000001','FINALIZED','Finalized',false,false,8),
  ('aaaaaaaa-0000-0000-0000-000000000001','CLOSED','Closed',false,true,9);

insert into api_ats.workflow_transitions (definition_id, from_state, to_state, transition_name, allowed_roles, requires_note, display_label) values
  ('aaaaaaaa-0000-0000-0000-000000000001','SOURCED','SUBMITTED_TO_TL','submit_to_tl','{RECRUITER}',false,'Submit to TL'),
  ('aaaaaaaa-0000-0000-0000-000000000001','SUBMITTED_TO_TL','TL_APPROVED','tl_approve','{TL,STL,ADMIN}',false,'Approve'),
  ('aaaaaaaa-0000-0000-0000-000000000001','SUBMITTED_TO_TL','TL_REJECTED','tl_reject','{TL,STL,ADMIN}',true,'Reject'),
  ('aaaaaaaa-0000-0000-0000-000000000001','TL_REJECTED','SOURCED','resubmit','{RECRUITER}',false,'Re-submit'),
  ('aaaaaaaa-0000-0000-0000-000000000001','TL_APPROVED','SUBMITTED_TO_STL','forward_to_stl','{TL,STL,ADMIN}',false,'Forward to STL'),
  ('aaaaaaaa-0000-0000-0000-000000000001','SUBMITTED_TO_STL','STL_APPROVED','stl_approve','{STL,ADMIN}',false,'Approve'),
  ('aaaaaaaa-0000-0000-0000-000000000001','SUBMITTED_TO_STL','STL_REJECTED','stl_reject','{STL,ADMIN}',true,'Reject'),
  ('aaaaaaaa-0000-0000-0000-000000000001','STL_APPROVED','FINALIZED','finalize','{BDE,ADMIN}',false,'Finalize'),
  ('aaaaaaaa-0000-0000-0000-000000000001','FINALIZED','CLOSED','close','{BDE,ADMIN}',false,'Close');

-- candidates: recruiter owns/reads/writes their own; TL/STL read candidates with an application
-- into their own department; BDE/ADMIN read all.
alter table api_ats.candidates enable row level security;
create policy "recruiter_own" on api_ats.candidates
  for all to authenticated_ats
  using (created_by_recruiter_id = auth.uid())
  with check (created_by_recruiter_id = auth.uid());
create policy "bde_admin_read_all" on api_ats.candidates
  for select to authenticated_ats using (api_ats.current_role() in ('BDE','ADMIN'));
create policy "dept_read_via_application" on api_ats.candidates
  for select to authenticated_ats
  using (api_ats.current_role() in ('TL','STL') and exists (
    select 1 from api_ats.applications a join api_ats.job_positions jp on jp.id = a.job_position_id
    where a.candidate_id = candidates.id and jp.department_id = api_ats.current_department()));
grant select, insert, update, delete on api_ats.candidates to authenticated_ats;

-- applications/workflow_instances/workflow_transition_logs: SELECT only. All writes go through
-- create_application()/transition_application() below (both security definer, so they don't
-- need direct insert/update grants on these tables -- same pattern as bootstrap_profile()).
alter table api_ats.applications enable row level security;
create policy "recruiter_read_own" on api_ats.applications
  for select to authenticated_ats using (recruiter_id = auth.uid());
create policy "dept_read" on api_ats.applications
  for select to authenticated_ats using (exists (
    select 1 from api_ats.job_positions jp
    where jp.id = job_position_id and jp.department_id = api_ats.current_department()));
create policy "bde_admin_read_all" on api_ats.applications
  for select to authenticated_ats using (api_ats.current_role() in ('BDE','ADMIN'));
grant select on api_ats.applications to authenticated_ats;

alter table api_ats.workflow_instances enable row level security;
create policy "visible_via_application" on api_ats.workflow_instances
  for select to authenticated_ats using (exists (
    select 1 from api_ats.applications a where a.workflow_instance_id = workflow_instances.id));
grant select on api_ats.workflow_instances to authenticated_ats;
-- ^ the subquery is itself filtered by applications' own RLS for the same caller, so this
-- correctly composes department/ownership scoping without repeating the logic.

alter table api_ats.workflow_transition_logs enable row level security;
create policy "visible_via_instance" on api_ats.workflow_transition_logs
  for select to authenticated_ats using (exists (
    select 1 from api_ats.workflow_instances wi where wi.id = instance_id));
grant select on api_ats.workflow_transition_logs to authenticated_ats;

-- workflow_definitions/states/transitions: read-only reference data for everyone, admin-writable.
alter table api_ats.workflow_definitions enable row level security;
create policy "read_all" on api_ats.workflow_definitions for select to authenticated_ats using (true);
create policy "admin_write" on api_ats.workflow_definitions for all to authenticated_ats
  using (api_ats.current_role()='ADMIN') with check (api_ats.current_role()='ADMIN');
grant select, insert, update, delete on api_ats.workflow_definitions to authenticated_ats;

alter table api_ats.workflow_states enable row level security;
create policy "read_all" on api_ats.workflow_states for select to authenticated_ats using (true);
create policy "admin_write" on api_ats.workflow_states for all to authenticated_ats
  using (api_ats.current_role()='ADMIN') with check (api_ats.current_role()='ADMIN');
grant select, insert, update, delete on api_ats.workflow_states to authenticated_ats;

alter table api_ats.workflow_transitions enable row level security;
create policy "read_all" on api_ats.workflow_transitions for select to authenticated_ats using (true);
create policy "admin_write" on api_ats.workflow_transitions for all to authenticated_ats
  using (api_ats.current_role()='ADMIN') with check (api_ats.current_role()='ADMIN');
grant select, insert, update, delete on api_ats.workflow_transitions to authenticated_ats;

create or replace function api_ats.create_application(
  p_candidate_id uuid, p_job_position_id uuid
) returns api_ats.applications
language plpgsql security definer set search_path = api_ats, pg_temp as $$
declare
  v_application   api_ats.applications;
  v_definition_id uuid;
  v_initial_state text;
  v_instance_id   uuid;
begin
  if api_ats.current_role() <> 'RECRUITER' then
    raise exception 'only a RECRUITER may create an application';
  end if;
  if not exists (select 1 from api_ats.recruiter_assignments ra
                 where ra.job_position_id = p_job_position_id and ra.recruiter_id = auth.uid()) then
    raise exception 'you are not assigned to this job position';
  end if;
  if not exists (select 1 from api_ats.candidates c
                 where c.id = p_candidate_id and c.created_by_recruiter_id = auth.uid()) then
    raise exception 'you may only apply candidates you created';
  end if;
  if exists (select 1 from api_ats.applications
             where candidate_id = p_candidate_id and job_position_id = p_job_position_id) then
    raise exception 'this candidate has already applied to this job';
  end if;

  select id into v_definition_id from api_ats.workflow_definitions
    where active order by created_at limit 1;
  if v_definition_id is null then
    raise exception 'no active workflow definition configured';
  end if;
  select state_name into v_initial_state from api_ats.workflow_states
    where definition_id = v_definition_id and is_initial limit 1;

  insert into api_ats.applications (candidate_id, job_position_id, recruiter_id)
  values (p_candidate_id, p_job_position_id, auth.uid())
  returning * into v_application;

  insert into api_ats.workflow_instances (definition_id, entity_type, entity_id, current_state)
  values (v_definition_id, 'APPLICATION', v_application.id, v_initial_state)
  returning id into v_instance_id;

  update api_ats.applications set workflow_instance_id = v_instance_id
    where id = v_application.id
    returning * into v_application;

  return v_application;
end;
$$;
grant execute on function api_ats.create_application(uuid, uuid) to authenticated_ats;

-- Note: written as sequential single-target SELECT INTOs rather than one join with a mixed
-- `wi.*, jp.department_id, ...` target list -- plpgsql only lets a `.*` expansion populate a
-- whole row/record target when it's the *sole* INTO target; mixing it with extra scalar targets
-- in the same INTO list doesn't map positionally the way you'd want, so this stays explicit.
create or replace function api_ats.transition_application(
  p_application_id uuid, p_transition_name text, p_note text default null
) returns api_ats.workflow_instances
language plpgsql security definer set search_path = api_ats, pg_temp as $$
declare
  v_application   api_ats.applications;
  v_instance      api_ats.workflow_instances;
  v_department_id uuid;
  v_transition    api_ats.workflow_transitions;
  v_role          text := api_ats.current_role();
begin
  select * into v_application from api_ats.applications where id = p_application_id;
  if v_application.id is null then
    raise exception 'application not found';
  end if;

  select department_id into v_department_id
    from api_ats.job_positions where id = v_application.job_position_id;

  select * into v_instance from api_ats.workflow_instances
    where id = v_application.workflow_instance_id
    for update;
  if v_instance.id is null then
    raise exception 'workflow instance not found';
  end if;

  select * into v_transition from api_ats.workflow_transitions
    where definition_id = v_instance.definition_id
      and from_state = v_instance.current_state
      and transition_name = p_transition_name;
  if v_transition.id is null then
    raise exception 'no such transition % from state %', p_transition_name, v_instance.current_state;
  end if;

  if not (v_role = any(v_transition.allowed_roles)) then
    raise exception 'role % is not permitted to perform transition %', v_role, p_transition_name;
  end if;
  if v_role in ('TL','STL') and v_department_id is distinct from api_ats.current_department() then
    raise exception 'not permitted for a different department';
  end if;
  if v_role = 'RECRUITER' and v_application.recruiter_id <> auth.uid() then
    raise exception 'not your application';
  end if;
  if v_transition.requires_note and (p_note is null or length(trim(p_note)) = 0) then
    raise exception 'transition % requires a note', p_transition_name;
  end if;

  update api_ats.workflow_instances
    set current_state = v_transition.to_state, updated_at = now()
    where id = v_instance.id
    returning * into v_instance;

  insert into api_ats.workflow_transition_logs (instance_id, from_state, to_state, performed_by, note)
  values (v_instance.id, v_transition.from_state, v_transition.to_state, auth.uid(), p_note);

  return v_instance;
end;
$$;
grant execute on function api_ats.transition_application(uuid, text, text) to authenticated_ats;

-- ============================================================
-- == Phase 5 -- Documents: resumes via Storage
-- ============================================================
--
-- One-time manual step (not part of this SQL file): create the `ats-resumes` bucket through
-- /admin/storage (or POST /admin/v1/storage/buckets), marked *public*. Storage in this platform
-- has no RLS/ACL layer -- access is hardcoded owner-only-or-public in StorageService.canRead --
-- so there's no way to express "readable by ATS staff only" without changing platform code.
-- A public bucket was the accepted tradeoff (documented in README.md): any authenticated user on
-- this deployment can read a resume's bytes if they know its storage_path, not just ATS staff.
-- This table only stores metadata + the storage_path pointer; api_ats RLS below still scopes who
-- can *see that a document exists* to the same audience who can see the candidate, mirroring
-- (not replacing) the platform's own access control on the bytes themselves.

create table api_ats.documents (
    id           uuid primary key default gen_random_uuid(),
    candidate_id uuid not null references api_ats.candidates(id) on delete cascade,
    file_name    text not null,
    storage_path text not null unique,
    content_type text,
    size_bytes   bigint,
    -- default auth.uid() -- same server-populated-identity pattern as candidates.created_by_recruiter_id.
    uploaded_by  uuid not null default auth.uid() references api_ats.profiles(user_id),
    created_at   timestamptz not null default now()
);

alter table api_ats.documents enable row level security;

-- Read: same audience as the candidate itself -- the subquery is filtered by candidates' own RLS
-- for the calling user, so this composes department/ownership scoping without repeating it
-- (same technique as Phase 4's "visible_via_application" on workflow_instances).
create policy "visible_via_candidate" on api_ats.documents
  for select to authenticated_ats
  using (exists (select 1 from api_ats.candidates c where c.id = candidate_id));

-- Write: only the candidate's owning recruiter manages that candidate's documents -- mirrors
-- candidates' own "recruiter_own" policy (BDE/ADMIN/TL/STL are read-only on candidates too).
create policy "recruiter_manage_own_candidate_docs" on api_ats.documents
  for all to authenticated_ats
  using (exists (
    select 1 from api_ats.candidates c
    where c.id = candidate_id and c.created_by_recruiter_id = auth.uid()))
  with check (exists (
    select 1 from api_ats.candidates c
    where c.id = candidate_id and c.created_by_recruiter_id = auth.uid()));

grant select, insert, update, delete on api_ats.documents to authenticated_ats;

-- ============================================================
-- == Phase 6 -- Interviews
-- ============================================================

create table api_ats.interviews (
    id               uuid primary key default gen_random_uuid(),
    application_id   uuid not null references api_ats.applications(id) on delete cascade,
    scheduled_at     timestamptz not null,
    -- freeform, not a profiles reference -- an interviewer may be external (a client contact),
    -- not necessarily a platform user.
    interviewer_name text not null,
    mode             text not null default 'VIDEO' check (mode in ('PHONE','VIDEO','IN_PERSON')),
    status           text not null default 'SCHEDULED'
                       check (status in ('SCHEDULED','COMPLETED','CANCELLED')),
    feedback         text,
    scheduled_by     uuid not null default auth.uid() references api_ats.profiles(user_id),
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

alter table api_ats.interviews enable row level security;

-- Same "inherit the application's own visibility" composition as Phase 4/5 (workflow_instances /
-- documents): anyone who can already see the application -- its recruiter, the job's department
-- staff, or BDE/ADMIN -- can view and manage its interviews. Unlike the application workflow
-- itself, interview status isn't a shared, cross-department state machine (no other actor's
-- permissions depend on it), so a single unified policy is enough -- no RPC needed here.
create policy "manage_via_application" on api_ats.interviews
  for all to authenticated_ats
  using (exists (select 1 from api_ats.applications a where a.id = application_id))
  with check (exists (select 1 from api_ats.applications a where a.id = application_id));

grant select, insert, update, delete on api_ats.interviews to authenticated_ats;
