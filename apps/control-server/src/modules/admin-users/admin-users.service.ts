import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AuthAuditService } from '../auth/auth-audit.service';
import { AuthPasswordResetTokensRepository } from '../auth/auth-password-reset-tokens.repository';
import { PublicUser, toPublicUser } from '../auth/auth-user.dto';
import { AuthUsersRepository } from '../auth/auth-users.repository';
import { ProjectRow } from '../projects/projects.repository';
import { ProjectsService } from '../projects/projects.service';

function randomOpaqueValue(): string {
  return randomBytes(18).toString('base64url');
}

export interface BulkCreateUserEntry {
  email: string;
  password?: string;
}

export interface BulkCreateUserResult {
  email: string;
  status: 'created' | 'skipped' | 'error';
  message?: string;
  temporaryPassword?: string;
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly usersRepo: AuthUsersRepository,
    private readonly resetTokensRepo: AuthPasswordResetTokensRepository,
    private readonly audit: AuthAuditService,
    private readonly projects: ProjectsService,
  ) {}

  async list(search: string | null, limit: number, offset: number, projectId?: string) {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();
    const { rows, total } = await this.usersRepo.list(search, limit, offset, project.id);
    return { users: rows.map(toPublicUser), total };
  }

  async create(
    email: string,
    password: string | undefined,
    adminEmail: string,
    projectId?: string,
  ): Promise<{ user: PublicUser; temporaryPassword?: string }> {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();
    return this.createOne(email, password, adminEmail, project);
  }

  /**
   * Shared by create() and createBulk() — resolves the project once (bulk resolves it once for
   * the whole batch rather than per row) and does the actual duplicate-check/hash/insert/audit
   * work.
   */
  private async createOne(
    email: string,
    password: string | undefined,
    adminEmail: string,
    project: ProjectRow,
  ): Promise<{ user: PublicUser; temporaryPassword?: string }> {
    const existing = await this.usersRepo.findByEmail(email, project.id);
    if (existing) {
      throw new UnprocessableEntityException({ message: 'User already registered' });
    }

    const temporaryPassword = password ?? randomOpaqueValue();
    const passwordHash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const user = await this.usersRepo.create(email, passwordHash, project.id);
    this.audit.record(user.id, 'admin.user_created', null, null, { createdBy: adminEmail });

    return { user: toPublicUser(user), temporaryPassword: password ? undefined : temporaryPassword };
  }

  /**
   * Creates as many users as possible from the batch rather than aborting on the first failure
   * (typically a duplicate email) — each row's outcome is reported independently so the caller
   * can show a per-row summary instead of an all-or-nothing error.
   */
  async createBulk(
    entries: BulkCreateUserEntry[],
    adminEmail: string,
    projectId?: string,
  ): Promise<{ results: BulkCreateUserResult[]; summary: { created: number; skipped: number; failed: number } }> {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();

    const results: BulkCreateUserResult[] = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of entries) {
      try {
        const { user, temporaryPassword } = await this.createOne(
          entry.email,
          entry.password,
          adminEmail,
          project,
        );
        results.push({ email: user.email, status: 'created', temporaryPassword });
        created += 1;
      } catch (err) {
        if (err instanceof UnprocessableEntityException) {
          results.push({ email: entry.email, status: 'skipped', message: 'User already registered' });
          skipped += 1;
        } else {
          results.push({
            email: entry.email,
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to create user',
          });
          failed += 1;
        }
      }
    }

    return { results, summary: { created, skipped, failed } };
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
