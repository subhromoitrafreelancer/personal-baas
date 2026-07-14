-- Runs as the Postgres superuser during container bootstrap. Creating an event trigger
-- requires superuser — baas_admin (the role node-pg-migrate and the admin SQL console use)
-- deliberately is not one, so this can't be a node-pg-migrate migration.
--
-- Fires NOTIFY pgrst on any DDL so PostgREST's schema cache reloads automatically, regardless
-- of whether the DDL came from the admin SQL console, a migration, or a direct psql session.
-- PostgREST v10+ listens on the 'pgrst' channel by default (db-channel-enabled), so no
-- PostgREST-side configuration is needed for this to take effect.

create or replace function platform.notify_pgrst_reload_schema()
returns event_trigger
language plpgsql
as $$
begin
  notify pgrst, 'reload schema';
end;
$$;

drop event trigger if exists baas_ddl_reload_pgrst;
create event trigger baas_ddl_reload_pgrst
  on ddl_command_end
  execute function platform.notify_pgrst_reload_schema();

drop event trigger if exists baas_drop_reload_pgrst;
create event trigger baas_drop_reload_pgrst
  on sql_drop
  execute function platform.notify_pgrst_reload_schema();
