export interface FunctionRow {
  id: string;
  project_id: string;
  name: string;
  code: string;
  timeout_ms: number;
  created_at: Date;
  updated_at: Date;
}

export interface FunctionInvocationRow {
  id: string;
  function_id: string;
  status: string;
  duration_ms: number;
  error: string | null;
  invoked_at: Date;
}
