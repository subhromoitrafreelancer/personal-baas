import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthUsersRepository } from './auth-users.repository';
import { PublicUser, toPublicUser } from './auth-user.dto';

@Injectable()
export class SignupService {
  constructor(private readonly usersRepo: AuthUsersRepository) {}

  async signup(email: string, password: string): Promise<PublicUser> {
    const existing = await this.usersRepo.findByEmail(email);
    if (existing) {
      throw new UnprocessableEntityException({ message: 'User already registered' });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await this.usersRepo.create(email, passwordHash);
    return toPublicUser(user);
  }
}
