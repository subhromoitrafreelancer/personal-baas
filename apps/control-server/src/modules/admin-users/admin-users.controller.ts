import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { paginationQuerySchema } from '../../common/pagination.dto';
import { AdminUsersService } from './admin-users.service';

const createUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  projectId: z.string().uuid().optional(),
});

const bulkCreateUsersBodySchema = z.object({
  projectId: z.string().uuid().optional(),
  users: z
    .array(
      z.object({
        email: z.string().email(),
        password: z.string().min(8, 'Password must be at least 8 characters').optional(),
      }),
    )
    .min(1, 'At least one user is required')
    .max(500, 'At most 500 users per batch'),
});

const setStatusBodySchema = z.object({
  status: z.enum(['active', 'disabled']),
});

@Controller('admin/v1/users')
@UseGuards(AdminSessionGuard)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('projectId') projectId?: string,
  ) {
    const parsed = paginationQuerySchema.safeParse({ limit, offset });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.adminUsers.list(search?.trim() || null, parsed.data.limit, parsed.data.offset, projectId);
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = createUserBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.adminUsers.create(
      parsed.data.email,
      parsed.data.password,
      req.admin!.email,
      parsed.data.projectId,
    );
  }

  @Post('bulk')
  async createBulk(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = bulkCreateUsersBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.adminUsers.createBulk(parsed.data.users, req.admin!.email, parsed.data.projectId);
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = setStatusBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.adminUsers.setStatus(id, parsed.data.status, req.admin!.email);
  }

  @Post(':id/reset-token')
  async resetToken(@Param('id') id: string, @Req() req: RequestWithAdmin) {
    return this.adminUsers.generateResetToken(id, req.admin!.email);
  }

  @Post(':id/temporary-password')
  async temporaryPassword(@Param('id') id: string, @Req() req: RequestWithAdmin) {
    return this.adminUsers.setTemporaryPassword(id, req.admin!.email);
  }
}
