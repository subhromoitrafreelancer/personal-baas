import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/pagination.dto';
import { AuthUsersRepository } from '../auth/auth-users.repository';
import { ServiceRoleBearerGuard } from '../auth/service-role-bearer.guard';
import { RequestWithServiceKey } from '../storage/storage-access.guard';

// Exported for openapi-docs.service.ts (scope.md §38).
export const statusQuerySchema = z.enum(['active', 'disabled', 'invited']).optional();

// GET /users/v1/directory (scope.md §36, Phase 22) — the narrowest read that lets a downstream
// project's own server-side code (a Function, or its own backend) look up its own project's
// users without either holding a platform-admin session cookie or needing `auth` exposed through
// PostgREST. See ServiceRoleBearerGuard for the auth story and AuthUsersRepository.list() for the
// query this reuses from AdminUsersController.
@Controller('users/v1/directory')
@UseGuards(ServiceRoleBearerGuard)
export class UserDirectoryController {
  constructor(private readonly authUsers: AuthUsersRepository) {}

  @Get()
  async list(
    @Req() req: RequestWithServiceKey,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    const parsedPagination = paginationQuerySchema.safeParse({ limit, offset });
    if (!parsedPagination.success) {
      throw new BadRequestException(
        parsedPagination.error.issues.map((issue) => issue.message).join('; '),
      );
    }
    const parsedStatus = statusQuerySchema.safeParse(status);
    if (!parsedStatus.success) {
      throw new BadRequestException('status must be one of: active, disabled, invited');
    }

    // req.serviceKey is always set here — ServiceRoleBearerGuard rejects the request otherwise.
    const projectId = req.serviceKey!.projectId;
    const { rows, total } = await this.authUsers.list(
      search?.trim() || null,
      parsedPagination.data.limit,
      parsedPagination.data.offset,
      projectId,
      parsedStatus.data ?? null,
    );

    // Strict allowlist (scope.md §36 point 3) — never password_hash, user_metadata,
    // app_metadata, or anything from sessions/refresh_tokens/identities.
    return {
      users: rows.map((row) => ({
        id: row.id,
        email: row.email,
        status: row.status,
        createdAt: row.created_at.toISOString(),
        lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
      })),
      total,
    };
  }
}
