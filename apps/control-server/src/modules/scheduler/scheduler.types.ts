export interface ScheduledJobRow {
  id: string;
  project_id: string;
  name: string;
  function_id: string;
  cron_expression: string;
  enabled: boolean;
  next_run_at: Date | null;
  last_run_at: Date | null;
  last_status: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface JobRunRow {
  id: string;
  job_id: string;
  started_at: Date;
  finished_at: Date | null;
  status: string | null;
  error: string | null;
}
