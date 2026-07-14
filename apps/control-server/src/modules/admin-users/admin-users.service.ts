import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuthAuditService } from '../auth/auth-audit.service';
import { AuthPasswordResetTokensRepository } from '../auth/auth-password-reset-tokens.repository';
import { PublicUser, toPublicUser } from '../auth/auth-user.dto';
import { AuthUsersRepository } from '../auth/auth-users.repository';

function randomOpaqueValue(): string {
  return randomBytes(18).toString('base64url');
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersRepo: AuthUsersRepository,
    private readonly resetTokensRepo: AuthPasswordResetTokensRepository,
    private readonly audit: AuthAuditService,
  ) {}

  async list(search: string | null, limit: number, offset: number) {
    const { rows, total } = await this.usersRepo.list(search, limit, offset);
    return { users: rows.map(toPublicUser), total };
  }

  async create(
    email: string,
    password: string | undefined,
    adminEmail: string,
  ): Promise<{ user: PublicUser; temporaryPassword?: string }> {
    const existing = await this.usersRepo.findByEmail(email);
    if (existing) {
      throw new UnprocessableEntityException({ message: 'User already registered' });
    }

    const temporaryPassword = password ?? randomOpaqueValue();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const user = await this.usersRepo.create(email, passwordHash);
    this.audit.record(user.id, 'admin.user_created', null, null, { createdBy: adminEmail });

    return { user: toPublicUser(user), temporaryPassword: password ? undefined : temporaryPassword };
  }

  async setStatus(id: string, status: 'active' | 'disabled', adminEmail: string): Promise<PublicUser> {
    const user = await this.usersRepo.setStatus(id, status);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    this.audit.record(user.id, 'admin.user_status_changed', null, null, { status, changedBy: adminEmail });
    return toPublicUser(user);
  }

  async generateResetToken(id: string, adminEmail: string): Promise<{ token: string; expiresAt: string }> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = randomOpaqueValue();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.resetTokensRepo.create(id, tokenHash, expiresAt);
    this.audit.record(id, 'admin.reset_token_generated', null, null, { generatedBy: adminEmail });

    return { token, expiresAt: expiresAt.toISOString() };
  }

  async setTemporaryPassword(id: string, adminEmail: string): Promise<{ temporaryPassword: string }> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const temporaryPassword = randomOpaqueValue();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await this.usersRepo.updatePasswordHash(id, passwordHash);
    this.audit.record(id, 'admin.temporary_password_set', null, null, { setBy: adminEmail });

    return { temporaryPassword };
  }
}
