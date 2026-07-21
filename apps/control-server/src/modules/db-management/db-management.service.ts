import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseError } from 'pg';
import { AdminIdentity } from '../admin-auth/admin.types';
import { AdminQueryService } from '../admin-db/admin-query.service';
import { AuthAuditService } from '../auth/auth-audit.service';
import {
  COLUMN_DEPENDENT_VIEWS_QUERY,
  COLUMN_EXISTS_QUERY,
  COLUMN_IS_PRIMARY_KEY_QUERY,
  FUNCTION_DEFINITION_QUERY,
  REFERENCING_FOREIGN_KEYS_QUERY,
  SCHEMA_FUNCTIONS_SOURCE_QUERY,
  TABLE_DEPENDENT_VIEWS_QUERY,
  TABLE_OBJECT_COUNTS_QUERY,
  TABLE_OID_QUERY,
  TABLE_ROW_ESTIMATE_QUERY,
} from './db-management.queries';
import { ColumnDeletePreview, ForeignKeyRef, FunctionRef, FunctionSource, TableDeletePreview, ViewRef } from './db-management.types';

// Identifiers reaching this point have already been verified to exist in pg_catalog (getTableOid/
// column-exists checks below) before ever being spliced into DDL text — Postgres has no bind-
// parameter support for identifiers, so this plus the existence check is the injection defense.
function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class DbManagementService {
  constructor(
    private readonly adminQuery: AdminQueryService,
    private readonly audit: AuthAuditService,
  ) {}

  private async getTableOid(schema: string, table: string): Promise<string> {
    const { rows } = await this.adminQuery.query<{ oid: string }>(TABLE_OID_QUERY, [schema, table]);
    if (rows.length === 0) {
      throw new NotFoundException(`Table "${schema}"."${table}" not found`);
    }
    return rows[0].oid;
  }

  // Best-effort, non-blocking (scope.md §29 point 4) — a text match can't distinguish a genuine
  // reference from a coincidental name collision, so this is surfaced as a warning, never a
  // blocker. Scoped to the table's own schema only, never cross-schema.
  private async findFunctionReferences(schema: string, table: string): Promise<FunctionRef[]> {
    const { rows } = await this.adminQuery.query<{ oid: string; name: string; source: string | null }>(
      SCHEMA_FUNCTIONS_SOURCE_QUERY,
      [schema],
    );
    const bare = new RegExp(`\\b${escapeRegExp(table)}\\b`, 'i');
    const qualified = new RegExp(`\\b${escapeRegExp(schema)}\\.${escapeRegExp(table)}\\b`, 'i');
    return rows
      .filter((row) => row.source && (bare.test(row.source) || qualified.test(row.source)))
      .map((row) => ({ oid: row.oid, name: row.name }));
  }

  async getTableDeletePreview(schema: string, table: string): Promise<TableDeletePreview> {
    const oid = await this.getTableOid(schema, table);

    const [estimateResult, countsResult, viewsResult, fksResult, functionReferences] = await Promise.all([
      this.adminQuery.query<{ estimate: string }>(TABLE_ROW_ESTIMATE_QUERY, [oid]),
      this.adminQuery.query<{ index_count: string; policy_count: string; trigger_count: string }>(
        TABLE_OBJECT_COUNTS_QUERY,
        [oid],
      ),
      this.adminQuery.query<ViewRef>(TABLE_DEPENDENT_VIEWS_QUERY, [schema, table]),
      this.adminQuery.query<{ schema: string; table: string; constraint_name: string }>(
        REFERENCING_FOREIGN_KEYS_QUERY,
        [oid],
      ),
      this.findFunctionReferences(schema, table),
    ]);

    return {
      schema,
      table,
      rowEstimate: Number(estimateResult.rows[0]?.estimate ?? 0),
      indexCount: Number(countsResult.rows[0]?.index_count ?? 0),
      policyCount: Number(countsResult.rows[0]?.policy_count ?? 0),
      triggerCount: Number(countsResult.rows[0]?.trigger_count ?? 0),
      blockers: {
        dependentViews: viewsResult.rows,
        referencingForeignKeys: fksResult.rows.map(
          (row): ForeignKeyRef => ({ schema: row.schema, table: row.table, constraintName: row.constraint_name }),
        ),
      },
      functionReferences,
    };
  }

  async deleteTable(schema: string, table: string, confirmName: string, admin: AdminIdentity): Promise<void> {
    if (confirmName !== table) {
      throw new ConflictException('Confirmation name does not match the table name');
    }

    const oid = await this.getTableOid(schema, table);

    // Re-checked here (not trusting a possibly-stale client-side preview) — the DROP TABLE below
    // is the real, authoritative gate regardless (Postgres refuses it atomically if a blocker
    // still exists), but failing here first gives a clear "blocked by X" message instead of a
    // raw Postgres error.
    const [viewsResult, fksResult, estimateResult, countsResult] = await Promise.all([
      this.adminQuery.query<ViewRef>(TABLE_DEPENDENT_VIEWS_QUERY, [schema, table]),
      this.adminQuery.query<{ schema: string; table: string; constraint_name: string }>(
        REFERENCING_FOREIGN_KEYS_QUERY,
        [oid],
      ),
      this.adminQuery.query<{ estimate: string }>(TABLE_ROW_ESTIMATE_QUERY, [oid]),
      this.adminQuery.query<{ index_count: string; policy_count: string; trigger_count: string }>(
        TABLE_OBJECT_COUNTS_QUERY,
        [oid],
      ),
    ]);

    if (viewsResult.rows.length > 0) {
      throw new ConflictException(
        `Blocked by dependent view(s): ${viewsResult.rows.map((v) => `${v.schema}.${v.name}`).join(', ')}`,
      );
    }
    if (fksResult.rows.length > 0) {
      throw new ConflictException(
        `Blocked by foreign key(s) referencing this table: ${fksResult.rows
          .map((fk) => `${fk.schema}.${fk.table} (${fk.constraint_name})`)
          .join(', ')}`,
      );
    }

    // A single DDL statement on its own connection is already atomic and fail-fast in Postgres —
    // it refuses to run at all if a blocking dependent exists, with no partial effect — and drops
    // the table's own indexes/policies/triggers together with it as one operation. No CASCADE:
    // a blocker here must be resolved by the admin, never silently swept away.
    try {
      const { result } = await this.adminQuery.withConnection((client) =>
        client.query(`DROP TABLE ${quoteIdent(schema)}.${quoteIdent(table)}`),
      );
      await result;
    } catch (err) {
      throw new ConflictException((err as DatabaseError).message ?? 'Failed to delete table');
    }

    this.audit.record(null, 'admin.table_deleted', null, null, {
      schema,
      table,
      rowEstimate: Number(estimateResult.rows[0]?.estimate ?? 0),
      indexCount: Number(countsResult.rows[0]?.index_count ?? 0),
      policyCount: Number(countsResult.rows[0]?.policy_count ?? 0),
      deletedBy: admin.email,
    });
  }

  async getColumnDeletePreview(schema: string, table: string, column: string): Promise<ColumnDeletePreview> {
    const oid = await this.getTableOid(schema, table);
    const columnExists = await this.adminQuery.query(COLUMN_EXISTS_QUERY, [oid, column]);
    if (columnExists.rows.length === 0) {
      throw new NotFoundException(`Column "${column}" not found on "${schema}"."${table}"`);
    }

    const [pkResult, viewsResult, estimateResult] = await Promise.all([
      this.adminQuery.query(COLUMN_IS_PRIMARY_KEY_QUERY, [oid, column]),
      this.adminQuery.query<ViewRef>(COLUMN_DEPENDENT_VIEWS_QUERY, [schema, table, column]),
      this.adminQuery.query<{ estimate: string }>(TABLE_ROW_ESTIMATE_QUERY, [oid]),
    ]);

    return {
      schema,
      table,
      column,
      isPrimaryKey: pkResult.rows.length > 0,
      rowEstimate: Number(estimateResult.rows[0]?.estimate ?? 0),
      blockers: { dependentViews: viewsResult.rows },
    };
  }

  async deleteColumn(schema: string, table: string, column: string, admin: AdminIdentity): Promise<void> {
    const oid = await this.getTableOid(schema, table);
    const columnExists = await this.adminQuery.query(COLUMN_EXISTS_QUERY, [oid, column]);
    if (columnExists.rows.length === 0) {
      throw new NotFoundException(`Column "${column}" not found on "${schema}"."${table}"`);
    }

    const viewsResult = await this.adminQuery.query<ViewRef>(COLUMN_DEPENDENT_VIEWS_QUERY, [schema, table, column]);
    if (viewsResult.rows.length > 0) {
      throw new ConflictException(
        `Blocked by dependent view(s): ${viewsResult.rows.map((v) => `${v.schema}.${v.name}`).join(', ')}`,
      );
    }

    try {
      const { result } = await this.adminQuery.withConnection((client) =>
        client.query(
          `ALTER TABLE ${quoteIdent(schema)}.${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`,
        ),
      );
      await result;
    } catch (err) {
      throw new ConflictException((err as DatabaseError).message ?? 'Failed to delete column');
    }

    this.audit.record(null, 'admin.column_deleted', null, null, { schema, table, column, deletedBy: admin.email });
  }

  async getFunctionSource(schema: string, oid: string): Promise<FunctionSource> {
    if (!/^\d+$/.test(oid)) {
      throw new NotFoundException('Function not found');
    }
    const { rows } = await this.adminQuery.query<FunctionSource>(FUNCTION_DEFINITION_QUERY, [oid]);
    if (rows.length === 0 || rows[0].schema !== schema) {
      throw new NotFoundException('Function not found');
    }
    return rows[0];
  }
}
