import { Injectable } from '@nestjs/common';
import { AdminQueryService } from '../admin-db/admin-query.service';
import { ProjectsService } from '../projects/projects.service';
import {
  COLUMNS_QUERY,
  CONSTRAINTS_QUERY,
  FOREIGN_KEYS_QUERY,
  FUNCTIONS_QUERY,
  INDEXES_QUERY,
  POLICIES_QUERY,
  SCHEMAS_QUERY,
  TABLES_QUERY,
} from './db-explorer.queries';
import { DatabaseObjectsResponse, FunctionInfo, SchemaInfo, TableInfo } from './db-explorer.types';

interface SchemaRow {
  schema: string;
}

interface TableRow {
  schema: string;
  name: string;
  kind: string;
  rls_enabled: boolean;
  rls_forced: boolean;
}

interface ColumnRow {
  schema: string;
  table: string;
  name: string;
  data_type: string;
  nullable: boolean;
  default: string | null;
  position: number;
}

interface ConstraintRow {
  schema: string;
  table: string;
  name: string;
  type: 'p' | 'u';
  columns: string[];
}

interface ForeignKeyRow {
  schema: string;
  table: string;
  name: string;
  columns: string[];
  references_schema: string;
  references_table: string;
  references_columns: string[];
}

interface IndexRow {
  schema: string;
  table: string;
  name: string;
  definition: string;
}

interface PolicyRow {
  schema: string;
  table: string;
  name: string;
  permissive: string;
  roles: string[];
  command: string;
  using: string | null;
  with_check: string | null;
}

interface FunctionRow {
  oid: string;
  schema: string;
  name: string;
  arguments: string;
  return_type: string;
  language: string;
}

@Injectable()
export class DbExplorerService {
  constructor(
    private readonly adminQuery: AdminQueryService,
    private readonly projects: ProjectsService,
  ) {}

  async getDatabaseObjects(): Promise<DatabaseObjectsResponse> {
    const [schemas, tables, columns, constraints, foreignKeys, indexes, policies, functions, projectRows] =
      await Promise.all([
        this.adminQuery.query<SchemaRow>(SCHEMAS_QUERY),
        this.adminQuery.query<TableRow>(TABLES_QUERY),
        this.adminQuery.query<ColumnRow>(COLUMNS_QUERY),
        this.adminQuery.query<ConstraintRow>(CONSTRAINTS_QUERY),
        this.adminQuery.query<ForeignKeyRow>(FOREIGN_KEYS_QUERY),
        this.adminQuery.query<IndexRow>(INDEXES_QUERY),
        this.adminQuery.query<PolicyRow>(POLICIES_QUERY),
        this.adminQuery.query<FunctionRow>(FUNCTIONS_QUERY),
        this.projects.list(),
      ]);

    // A table is API-exposed if it lives in *any* project's schema (scope.md §23) — not just
    // the literal 'api' schema, which was the only one that existed before Phase 9 and is now
    // just the default project's. postgrest.conf's db-schemas is the actual source of truth
    // for what's live, but it's a config file, not a DB fact — platform.projects.schema_name
    // is the closest thing to "expected to be exposed once postgrest.conf/restart catch up".
    const apiSchemaNames = new Set(projectRows.map((row) => row.schema_name));

    const tableKey = (schema: string, table: string) => `${schema}.${table}`;
    const tablesByKey = new Map<string, TableInfo>();

    for (const row of tables.rows) {
      tablesByKey.set(tableKey(row.schema, row.name), {
        name: row.name,
        kind: row.kind,
        apiExposed: apiSchemaNames.has(row.schema),
        rlsEnabled: row.rls_enabled,
        rlsForced: row.rls_forced,
        columns: [],
        primaryKey: null,
        uniqueConstraints: [],
        foreignKeys: [],
        indexes: [],
        policies: [],
      });
    }

    for (const row of columns.rows) {
      tablesByKey.get(tableKey(row.schema, row.table))?.columns.push({
        name: row.name,
        dataType: row.data_type,
        nullable: row.nullable,
        default: row.default,
        position: row.position,
      });
    }

    for (const row of constraints.rows) {
      const table = tablesByKey.get(tableKey(row.schema, row.table));
      if (!table) continue;
      if (row.type === 'p') {
        table.primaryKey = { name: row.name, columns: row.columns };
      } else {
        table.uniqueConstraints.push({ name: row.name, columns: row.columns });
      }
    }

    for (const row of foreignKeys.rows) {
      tablesByKey.get(tableKey(row.schema, row.table))?.foreignKeys.push({
        name: row.name,
        columns: row.columns,
        referencesSchema: row.references_schema,
        referencesTable: row.references_table,
        referencesColumns: row.references_columns,
      });
    }

    for (const row of indexes.rows) {
      tablesByKey.get(tableKey(row.schema, row.table))?.indexes.push({
        name: row.name,
        definition: row.definition,
      });
    }

    for (const row of policies.rows) {
      tablesByKey.get(tableKey(row.schema, row.table))?.policies.push({
        name: row.name,
        permissive: row.permissive,
        roles: row.roles,
        command: row.command,
        using: row.using,
        withCheck: row.with_check,
      });
    }

    const functionsBySchema = new Map<string, FunctionInfo[]>();
    for (const row of functions.rows) {
      const list = functionsBySchema.get(row.schema) ?? [];
      list.push({
        oid: row.oid,
        name: row.name,
        arguments: row.arguments,
        returnType: row.return_type,
        language: row.language,
      });
      functionsBySchema.set(row.schema, list);
    }

    const schemaInfos: SchemaInfo[] = schemas.rows.map((row) => ({
      name: row.schema,
      tables: tables.rows
        .filter((t) => t.schema === row.schema)
        .map((t) => tablesByKey.get(tableKey(t.schema, t.name))!),
      functions: functionsBySchema.get(row.schema) ?? [],
    }));

    return { schemas: schemaInfos };
  }
}
