import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Phase 9 (scope.md §23): platform.projects is the source of truth for which Postgres
// schema/roles a project's REST API/auth traffic maps to. schema_name/anon_role/
// authenticated_role/service_role_role are stored explicitly (not derived by string
// concatenation from slug) specifically so the pre-existing project below can keep the
// legacy unsuffixed names ('api'/'anon'/'authenticated'/'service_role') as a first-class
// row instead of a scattered "if slug === 'default'" special case in application code.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'platform', name: 'projects' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      slug: { type: 'text', notNull: true },
      name: { type: 'text', notNull: true },
      schema_name: { type: 'text', notNull: true },
      anon_role: { type: 'text', notNull: true },
      authenticated_role: { type: 'text', notNull: true },
      service_role_role: { type: 'text', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );

  pgm.createIndex(
    { schema: 'platform', name: 'projects' },
    'slug',
    { unique: true, name: 'projects_slug_idx' },
  );
  pgm.createIndex(
    { schema: 'platform', name: 'projects' },
    'schema_name',
    { unique: true, name: 'projects_schema_name_idx' },
  );

  // Seed the pre-existing project: the schema/roles created by the original Phase 0
  // bootstrap (packages/database-bootstrap), kept under their legacy unsuffixed names so
  // every existing dev flow and the Phase 7a examples/todo-app client keep working
  // unchanged (scope.md §23 decision — this is the one project that isn't api_<slug>).
  pgm.sql(`
    insert into platform.projects
      (slug, name, schema_name, anon_role, authenticated_role, service_role_role)
    values
      ('default', 'Default Project', 'api', 'anon', 'authenticated', 'service_role')
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'platform', name: 'projects' });
}
