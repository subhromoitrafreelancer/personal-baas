export interface StorageBucketRow {
  id: string;
  project_id: string;
  name: string;
  public: boolean;
  size_limit_bytes: string | null;
  created_at: Date;
}

export interface StorageObjectRow {
  id: string;
  bucket_id: string;
  path: string;
  owner: string | null;
  size: string;
  content_type: string | null;
  created_at: Date;
}
