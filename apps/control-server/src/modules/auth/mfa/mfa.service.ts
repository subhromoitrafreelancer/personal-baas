import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import { VaultCryptoService } from '../../vault/vault-crypto.service';
import { AuthAuditService } from '../auth-audit.service';
import { AuthUsersRepository } from '../auth-users.repository';
import { MfaBackupCodesRepository } from './mfa-backup-codes.repository';
import { MfaFactorsRepository } from './mfa-factors.repository';
import { MfaEnrollResult, MfaVerifyEnrollmentResult } from './mfa.types';

const BACKUP_CODE_COUNT = 10;
// TOTP's default 30s period; ±1 step tolerates normal clock drift between server and device.
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

function generateBackupCode(): string {
  const raw = randomBytes(5).toString('hex').toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

// otplib's TOTP verify() throws (e.g. TokenLengthError) for a malformed token — including,
// critically, a backup code's shape (11 chars, not 6 digits) — rather than resolving to
// { valid: false } the way a wrong-but-correctly-shaped code does. verifyLogin() always has to
// try a TOTP check first and fall through to backup codes on failure, so a throw here must be
// treated as "not valid", not allowed to propagate as an unhandled 500.
async function verifyTotp(secret: string, token: string): Promise<boolean> {
  try {
    const result = await verify({ secret, token, epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS });
    return result.valid;
  } catch {
    return false;
  }
}

@Injectable()
export class MfaService {
  constructor(
    private readonly factors: MfaFactorsRepository,
    private readonly backupCodes: MfaBackupCodesRepository,
    private readonly usersRepo: AuthUsersRepository,
    private readonly vaultCrypto: VaultCryptoService,
    private readonly audit: AuthAuditService,
  ) {}

  async hasVerifiedFactor(userId: string): Promise<boolean> {
    return this.factors.hasVerifiedFactor(userId);
  }

  // issuer is that project's own `name` field (scope.md §33 point 10) — not a platform-wide
  // constant, so two different projects' MFA entries are distinguishable in an authenticator
  // app. Rejects with 409 if a verified factor already exists (point 9) — the caller must
  // self-disable or get an admin reset first; an existing *unverified* (abandoned) factor has
  // nothing valid to protect and is silently overwritten.
  async enroll(userId: string, email: string, issuer: string): Promise<MfaEnrollResult> {
    const existing = await this.factors.findByUserId(userId);
    if (existing?.verified) {
      throw new ConflictException(
        'MFA is already enabled for this account. Disable it before enrolling a new factor.',
      );
    }

    const secret = generateSecret();
    const { nonce, ciphertext } = this.vaultCrypto.encrypt(secret);
    await this.factors.upsert(userId, nonce, ciphertext);

    const otpauthUri = generateURI({ issuer, label: email, secret });
    return { secret, otpauthUri };
  }

  // A factor is never usable for login until this succeeds — prevents a user locking themselves
  // out by enrolling with a misconfigured authenticator app before ever confirming it works.
  async verifyEnrollment(userId: string, code: string): Promise<MfaVerifyEnrollmentResult> {
    const factor = await this.factors.findByUserId(userId);
    if (!factor) {
      throw new UnauthorizedException('No pending MFA enrollment for this account');
    }

    const secret = this.vaultCrypto.decrypt(factor.secret_nonce, factor.secret_ciphertext);
    if (!(await verifyTotp(secret, code))) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.factors.markVerified(userId);

    // Regenerating invalidates all previously-unused codes (scope.md §33 point 3) — for a fresh
    // enrollment this is a no-op delete, but the same call also backs a future "regenerate
    // backup codes" self-service action without a second code path.
    await this.backupCodes.deleteByUserId(userId);
    const rawCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
    const hashes = await Promise.all(
      rawCodes.map((code) => argon2.hash(code, { type: argon2.argon2id })),
    );
    await this.backupCodes.insertBatch(userId, hashes);

    this.audit.record(userId, 'mfa.enrolled', null, null, {});

    return { backupCodes: rawCodes };
  }

  // Used by the login handshake (branch b, scope.md §33 point 5) — tries the TOTP code first,
  // falling back to a backup code. Never throws; the caller (LoginService) decides how to
  // respond to a false result.
  async verifyLogin(userId: string, code: string): Promise<boolean> {
    const factor = await this.factors.findByUserId(userId);
    if (factor?.verified) {
      const secret = this.vaultCrypto.decrypt(factor.secret_nonce, factor.secret_ciphertext);
      if (await verifyTotp(secret, code)) {
        return true;
      }
    }

    const unusedCodes = await this.backupCodes.findUnusedByUserId(userId);
    for (const backupCode of unusedCodes) {
      if (await argon2.verify(backupCode.code_hash, code)) {
        await this.backupCodes.markUsed(backupCode.id);
        return true;
      }
    }

    return false;
  }

  // Disabling MFA is itself a sensitive action — requires the current password plus a valid
  // TOTP/backup code as re-confirmation, not just a bare authenticated session (e.g. a stolen
  // access token with no factor of its own can't use this to strip protection).
  async selfDisable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.usersRepo.findById(userId);
    if (!user || !(await argon2.verify(user.password_hash, password))) {
      throw new UnauthorizedException('Invalid password');
    }
    if (!(await this.verifyLogin(userId, code))) {
      throw new UnauthorizedException('Invalid code');
    }

    await this.factors.deleteByUserId(userId);
    await this.backupCodes.deleteByUserId(userId);
    this.audit.record(userId, 'mfa.disabled', null, null, {});
  }

  // Admin-triggered lockout recovery (scope.md §33 point 12) — no password/code confirmation
  // needed, same trust level as every other admin user-management action (§5.1).
  async adminReset(userId: string, adminEmail: string): Promise<void> {
    await this.factors.deleteByUserId(userId);
    await this.backupCodes.deleteByUserId(userId);
    this.audit.record(userId, 'admin.mfa_reset', null, null, { resetBy: adminEmail });
  }
}
