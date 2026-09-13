export interface MfaFactorRow {
  id: string;
  user_id: string;
  type: 'totp';
  secret_nonce: Buffer;
  secret_ciphertext: Buffer;
  verified: boolean;
  created_at: Date;
  verified_at: Date | null;
}

export interface MfaBackupCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Date;
}

// Returned by MfaService.enroll() — the raw secret is only ever handed back at this one moment;
// it's never re-readable afterward, same write-once-reveal posture as API keys/Vault secrets.
export interface MfaEnrollResult {
  secret: string;
  otpauthUri: string;
}

// Returned by MfaService.verifyEnrollment() — backup codes are shown exactly once, same
// convention as MfaEnrollResult's secret.
export interface MfaVerifyEnrollmentResult {
  backupCodes: string[];
}
