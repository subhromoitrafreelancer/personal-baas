import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Phase 9 PR3 (scope.md §23 point 3): auth.users and platform.api_keys become project-scoped.
// Backfilled to the pre-existing 'default' project (seeded by 1784500000000_create-projects.ts)
// before the not-null constraint lands, so every row created prior to this migration keeps
// working unchanged. The old global lower(email) uniqueness becomes per-project.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(
    { schema: 'auth', name: 'users' },
    { project_id: { type: 'uuid', references: { schema: 'platform', name: 'projects' } } },
  );
  pgm.addColumn(
    { schema: 'platform', name: 'api_keys' },
    { project_id: { type: 'uuid', references: { schema: 'platform', name: 'projects' } } },
  );

  pgm.sql(`
    update auth.users
    set project_id = (select id from platform.projects where slug = 'default')
    where project_id is null
  `);
  pgm.sql(`
    update platform.api_keys
    set project_id = (select id from platform.projects where slug = 'default')
    where project_id is null
  `);

  pgm.alterColumn({ schema: 'auth', name: 'users' }, 'project_id', { notNull: true });
  pgm.alterColumn({ schema: 'platform', name: 'api_keys' }, 'project_id', { notNull: true });

  pgm.dropIndex({ schema: 'auth', name: 'users' }, 'lower(email)', {
    name: 'auth_users_email_lower_idx',
  });
  pgm.createIndex({ schema: 'auth', name: 'users' }, ['project_id', 'lower(email)'], {
    unique: true,
    name: 'auth_users_project_email_lower_idx',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex({ schema: 'auth', name: 'users' }, ['project_id', 'lower(email)'], {
    name: 'auth_users_project_email_lower_idx',
  });
  pgm.createIndex({ schema: 'auth', name: 'users' }, 'lower(email)', {
    unique: true,
    name: 'auth_users_email_lower_idx',
  });
  pgm.dropColumn({ schema: 'platform', name: 'api_keys' }, 'project_id');
  pgm.dropColumn({ schema: 'auth', name: 'users' }, 'project_id');
}
