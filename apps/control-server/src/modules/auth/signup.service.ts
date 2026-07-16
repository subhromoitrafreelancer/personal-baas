import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ProjectsService } from '../projects/projects.service';
import { AuthAuditService } from './auth-audit.service';
import { AuthUsersRepository } from './auth-users.repository';
import { PublicUser, toPublicUser } from './auth-user.dto';

@Injectable()
export class SignupService {
  constructor(
    private readonly usersRepo: AuthUsersRepository,
    private readonly audit: AuthAuditService,
    private readonly projects: ProjectsService,
  ) {}

  async signup(
    email: string,
    password: string,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<PublicUser> {
    // TODO(Phase 9 PR5): resolve the target project from the pre-login publishable-key
    // bearer instead of always the default project.
    const project = await this.projects.getDefault();

    const existing = await this.usersRepo.findByEmail(email, project.id);
    if (existing) {
      throw new UnprocessableEntityException({ message: 'User already registered' });
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await this.usersRepo.create(email, passwordHash, project.id);
    this.audit.record(user.id, 'user.signup', ipAddress, userAgent);
    return toPublicUser(user);
  }
}
