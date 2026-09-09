export interface VaultSecretRow {
  id: string;
  project_id: string;
  name: string;
  nonce: Buffer;
  ciphertext: Buffer;
  created_at: Date;
  updated_at: Date;
}

export interface VaultSecretMetadata {
  id: string;
  name: string;
  updatedAt: string;
}
