export interface HostingSiteRow {
  id: string;
  project_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface HostingSiteFileRow {
  id: string;
  site_id: string;
  path: string;
  size: string;
  content_type: string | null;
  deployed_at: Date;
}
