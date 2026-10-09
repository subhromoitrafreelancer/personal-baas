import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AuthAuditService } from '../auth/auth-audit.service';
import { toPublicUser } from '../auth/auth-user.dto';
import { AuthUsersRepository } from '../auth/auth-users.repository';
import { ServiceRoleBearerGuard } from '../auth/service-role-bearer.guard';
import { RequestWithServiceKey } from '../storage/storage-access.guard';

const createBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});
const emailBodySchema = z.object({ email: z.string().email() });
const passwordBodySchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
  }
  return parsed.data;
}

// Service-role counterpart of the admin-session-only /admin/v1/users actions, for a downstream
// project's own server-side code (a Function) that manages its own users without holding a
// platform-admin cookie. Same trust model and project scoping as GET /users/v1/directory:
// project_id comes only from the verified key, and every :id is checked to belong to that project
// before anything is touched. Deliberately no delete and no status change.
@Controller('users/v1/manage')
@UseGuards(ServiceRoleBearerGuard)
export class UserManagementController {
  constructor(
    private readonly users: AuthUsersRepository,
    private readonly audit: AuthAuditService,
  ) {}

  @Post()
  async create(@Req() req: RequestWithServiceKey, @Body() body: unknown) {
    const { email, password } = parse(createBodySchema, body);
    const projectId = req.serviceKey!.projectId;
    if (await this.users.findByEmail(email, projectId)) {
      throw new UnprocessableEntityException({ message: 'User already registered' });
    }
    const temporaryPassword = password ?? randomBytes(18).toString('base64url');
    const hash = await argon2.hash(temporaryPassword, { type: argon2.argon2id });
    const user = await this.users.create(email, hash, projectId);
    this.audit.record(user.id, 'service.user_created', null, null, {});
    return { user: toPublicUser(user), temporaryPassword };
  }

  @Patch(':id/email')
  async changeEmail(@Req() req: RequestWithServiceKey, @Param('id') id: string, @Body() body: unknown) {
    const { email } = parse(emailBodySchema, body);
    const user = await this.ownUser(req, id);
    const clash = await this.users.findByEmail(email, user.project_id);
    if (clash && clash.id !== user.id) {
      throw new UnprocessableEntityException({ message: 'Email is already assigned to another user' });
    }
    const updated = await this.users.updateEmail(id, email);
    this.audit.record(id, 'service.user_email_changed', null, null, { from: user.email, to: email });
    return { user: toPublicUser(updated!) };
  }

  @Post(':id/temporary-password')
  async temporaryPassword(@Req() req: RequestWithServiceKey, @Param('id') id: string, @Body() body: unknown) {
    const { password } = parse(passwordBodySchema, body ?? {});
    await this.ownUser(req, id);
    const temporaryPassword = password ?? randomBytes(18).toString('base64url');
    await this.users.updatePasswordHash(id, await argon2.hash(temporaryPassword, { type: argon2.argon2id }));
    this.audit.record(id, 'service.temporary_password_set', null, null, {});
    return { temporaryPassword };
  }

  private async ownUser(req: RequestWithServiceKey, id: string) {
    const user = await this.users.findById(id).catch(() => null);
    // Same 404 for "no such user" and "another project's user" -- don't reveal which.
    if (!user || user.project_id !== req.serviceKey!.projectId) throw new NotFoundException('User not found');
    return user;
  }
}
