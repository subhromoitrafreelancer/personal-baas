import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { EnvConfig } from '../../config/env.schema';
import { EmailService } from '../email/email.service';
import { ProjectRow } from '../projects/projects.repository';
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
    private readonly email: EmailService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  // Self-service password reset (scope.md §32 point 7), finally implementing the flow deferred
  // since §6. Always resolves successfully regardless of whether the email exists or whether the
  // project even has email configured — both are the same class of information-leak problem as
  // revealing account existence, so this method must behave identically for a real user, an
  // unknown email, and an unconfigured project. This is additive to, not a replacement for, the
  // existing admin-generated reset-link/temporary-password flow below.
  async requestReset(
    email: string,
    project: ProjectRow,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const user = await this.usersRepo.findByEmail(email, project.id);
    if (!user) {
      return;
    }

    const rawToken = randomBytes(18).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour, same as admin-generated tokens
    await this.resetTokensRepo.create(user.id, tokenHash, expiresAt);

    const resetUrl = this.config
      .get('PASSWORD_RESET_URL_TEMPLATE', { infer: true })
      .replace('{token}', encodeURIComponent(rawToken));

    // EmailService.send() never throws and always logs to email.sent_messages regardless of
    // outcome — this method deliberately does not inspect the result, since a send failure (no
    // provider configured, provider error) must not change this endpoint's response.
    await this.email.send(project.id, {
      to: user.email,
      subject: 'Reset your password',
      html: `<p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      text: `Reset your password: ${resetUrl} (expires in 1 hour)`,
    });

    this.audit.record(user.id, 'user.password_reset_requested', ipAddress, userAgent);
  }

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
