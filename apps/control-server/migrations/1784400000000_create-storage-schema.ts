import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// Storage metadata (Phase 7, scope.md §21). The `storage` schema itself is created by
// packages/database-bootstrap/sql/002_schemas.sql (superuser-run bootstrap, same convention as
// platform/auth/api/private) — this migration only creates the tables within it. Logical
// developer-facing "buckets" are key prefixes within one real MinIO bucket, not real MinIO
// buckets; storage.objects is the source of truth for access decisions, MinIO only stores bytes.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    { schema: 'storage', name: 'buckets' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      name: { type: 'text', notNull: true },
      public: { type: 'boolean', notNull: true, default: false },
      size_limit_bytes: { type: 'bigint' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.createIndex({ schema: 'storage', name: 'buckets' }, 'name', { unique: true });

  pgm.createTable(
    { schema: 'storage', name: 'objects' },
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      bucket_id: {
        type: 'uuid',
        notNull: true,
        references: { schema: 'storage', name: 'buckets' },
        onDelete: 'CASCADE',
      },
      path: { type: 'text', notNull: true },
      // Nullable: objects uploaded through the admin console's manual test upload (Phase 7 #6)
      // have no owning application user. Owner-based access checks treat a NULL owner as
      // accessible only via the admin path or a public-bucket read, never via another app user's
      // JWT — same "on delete set null" convention as auth.audit_events.user_id.
      owner: {
        type: 'uuid',
        references: { schema: 'auth', name: 'users' },
        onDelete: 'SET NULL',
      },
      size: { type: 'bigint', notNull: true },
      content_type: { type: 'text' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
  );
  pgm.addConstraint({ schema: 'storage', name: 'objects' }, 'objects_bucket_path_unique', {
    unique: ['bucket_id', 'path'],
  });
  pgm.createIndex({ schema: 'storage', name: 'objects' }, 'owner');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable({ schema: 'storage', name: 'objects' });
  pgm.dropTable({ schema: 'storage', name: 'buckets' });
}
