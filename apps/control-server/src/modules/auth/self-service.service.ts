import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthSessionsRepository } from './auth-sessions.repository';
import { PublicUser, toPublicUser } from './auth-user.dto';
import { AuthUsersRepository } from './auth-users.repository';

@Injectable()
export class SelfServiceService {
  constructor(
    private readonly usersRepo: AuthUsersRepository,
    private readonly sessionsRepo: AuthSessionsRepository,
  ) {}

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toPublicUser(user);
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const valid = await argon2.verify(user.password_hash, currentPassword);
    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.usersRepo.updatePasswordHash(userId, newHash);
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionsRepo.revoke(sessionId);
  }
}
