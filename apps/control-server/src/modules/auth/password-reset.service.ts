import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'crypto';
import { AuthAuditService } from './auth-audit.service';
import { AuthPasswordResetTokensRepository } from './auth-password-reset-tokens.repository';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { AuthUsersRepository } from './auth-users.repository';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly resetTokensRepo: AuthPasswordResetTokensRepository,
    private readonly usersRepo: AuthUsersRepository,
    private readonly sessionsRepo: AuthSessionsRepository,
    private readonly audit: AuthAuditService,
  ) {}

  // Completes the flow started by an admin-generated reset link (admin-users.service.ts's
  // generateResetToken, which hashes the raw token with the same sha256 used here). This
  // endpoint is deliberately unauthenticated — the token itself is the credential.
  async resetPassword(
    rawToken: string,
    newPassword: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const token = await this.resetTokensRepo.findByHash(tokenHash);

    if (!token || token.used_at || token.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.usersRepo.updatePasswordHash(token.user_id, passwordHash);
    await this.resetTokensRepo.markUsed(token.id);
    await this.sessionsRepo.revokeAllForUser(token.user_id);

    this.audit.record(token.user_id, 'user.password_reset_completed', ipAddress, userAgent);
  }
}
