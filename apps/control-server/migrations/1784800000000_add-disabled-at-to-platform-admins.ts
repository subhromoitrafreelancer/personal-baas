import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(
    { schema: 'platform', name: 'platform_admins' },
    { disabled_at: { type: 'timestamptz' } },
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn({ schema: 'platform', name: 'platform_admins' }, 'disabled_at');
}
