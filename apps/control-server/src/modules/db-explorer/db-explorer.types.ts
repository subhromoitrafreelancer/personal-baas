export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  default: string | null;
  position: number;
}

export interface ConstraintInfo {
  name: string;
  columns: string[];
}

export interface ForeignKeyInfo extends ConstraintInfo {
  referencesSchema: string;
  referencesTable: string;
  referencesColumns: string[];
}

export interface IndexInfo {
  name: string;
  definition: string;
}

export interface PolicyInfo {
  name: string;
  permissive: string;
  roles: string[];
  command: string;
  using: string | null;
  withCheck: string | null;
}

export interface TableInfo {
  name: string;
  kind: string;
  apiExposed: boolean;
  rlsEnabled: boolean;
  rlsForced: boolean;
  columns: ColumnInfo[];
  primaryKey: ConstraintInfo | null;
  uniqueConstraints: ConstraintInfo[];
  foreignKeys: ForeignKeyInfo[];
  indexes: IndexInfo[];
  policies: PolicyInfo[];
}

export interface FunctionInfo {
  name: string;
  arguments: string;
  returnType: string;
  language: string;
}

export interface SchemaInfo {
  name: string;
  tables: TableInfo[];
  functions: FunctionInfo[];
}

export interface DatabaseObjectsResponse {
  schemas: SchemaInfo[];
}
