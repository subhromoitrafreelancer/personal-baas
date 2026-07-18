import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Phase 10 (scope.md §24): storage.buckets becomes project-scoped, closing a gap Phase 7
// shipped before Phase 9's project model existed — bucket names were globally unique and
// StorageRequester carried no project context, so any project's valid JWT could read/write/
// delete any other project's bucket by name. Backfilled to the pre-existing 'default' project
// (same pattern as 1784600000000_add-project-id-to-auth-and-api-keys.ts) before the not-null
// constraint lands, so every bucket created prior to this migration (e.g. examples/todo-app's
// todo-attachments) keeps working unchanged. storage.objects needs no project_id of its own —
// its bucket_id foreign key already pins it to exactly one project transitively.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(
    { schema: 'storage', name: 'buckets' },
    { project_id: { type: 'uuid', references: { schema: 'platform', name: 'projects' } } },
  );

  pgm.sql(`
    update storage.buckets
    set project_id = (select id from platform.projects where slug = 'default')
    where project_id is null
  `);

  pgm.alterColumn({ schema: 'storage', name: 'buckets' }, 'project_id', { notNull: true });

  // Original creation (1784400000000_create-storage-schema.ts) used { unique: true } with no
  // explicit name, so node-pg-migrate's default naming applies here too (table_columns_unique_index).
  pgm.dropIndex({ schema: 'storage', name: 'buckets' }, 'name', { unique: true });
  pgm.createIndex({ schema: 'storage', name: 'buckets' }, ['project_id', 'name'], {
    unique: true,
    name: 'storage_buckets_project_name_idx',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex({ schema: 'storage', name: 'buckets' }, ['project_id', 'name'], {
    name: 'storage_buckets_project_name_idx',
  });
  pgm.createIndex({ schema: 'storage', name: 'buckets' }, 'name', { unique: true });
  pgm.dropColumn({ schema: 'storage', name: 'buckets' }, 'project_id');
}
