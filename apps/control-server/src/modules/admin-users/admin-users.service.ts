import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
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
  ) {}

  async list(search: string | null, limit: number, offset: number) {
    const { rows, total } = await this.usersRepo.list(search, limit, offset);
    return { users: rows.map(toPublicUser), total };
  }

  async create(email: string, password: string | undefined): Promise<{ user: PublicUser; temporaryPassword?: string }> {
    const existing = await this.usersRepo.findByEmail(email);
    if (existing) {
      throw new UnprocessableEntityException({ message: 'User already registered' });
    }

    const temporaryPassword = password ?? randomOpaqueValue();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const user = await this.usersRepo.create(email, passwordHash);

    return { user: toPublicUser(user), temporaryPassword: password ? undefined : temporaryPassword };
  }

  async setStatus(id: string, status: 'active' | 'disabled'): Promise<PublicUser> {
    const user = await this.usersRepo.setStatus(id, status);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async generateResetToken(id: string): Promise<{ token: string; expiresAt: string }> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = randomOpaqueValue();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.resetTokensRepo.create(id, tokenHash, expiresAt);

    return { token, expiresAt: expiresAt.toISOString() };
  }

  async setTemporaryPassword(id: string): Promise<{ temporaryPassword: string }> {
    const user = await this.usersRepo.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const temporaryPassword = randomOpaqueValue();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    await this.usersRepo.updatePasswordHash(id, passwordHash);

    return { temporaryPassword };
  }
}
