export interface ViewRef {
  schema: string;
  name: string;
}

export interface ForeignKeyRef {
  schema: string;
  table: string;
  constraintName: string;
}

export interface FunctionRef {
  oid: string;
  name: string;
}

export interface TableDeletePreview {
  schema: string;
  table: string;
  rowEstimate: number;
  indexCount: number;
  policyCount: number;
  triggerCount: number;
  blockers: {
    dependentViews: ViewRef[];
    referencingForeignKeys: ForeignKeyRef[];
  };
  functionReferences: FunctionRef[];
}

export interface ColumnDeletePreview {
  schema: string;
  table: string;
  column: string;
  isPrimaryKey: boolean;
  rowEstimate: number;
  blockers: {
    dependentViews: ViewRef[];
  };
}

export interface FunctionSource {
  schema: string;
  name: string;
  language: string;
  definition: string;
}
