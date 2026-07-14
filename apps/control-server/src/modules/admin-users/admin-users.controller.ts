import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { AdminUsersService } from './admin-users.service';

const createUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

const setStatusBodySchema = z.object({
  status: z.enum(['active', 'disabled']),
});

@Controller('admin/v1/users')
@UseGuards(AdminSessionGuard)
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  async list(@Query('search') search?: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.adminUsers.list(
      search?.trim() || null,
      Math.min(Number(limit) || 50, 200),
      Number(offset) || 0,
    );
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = createUserBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.adminUsers.create(parsed.data.email, parsed.data.password, req.admin!.email);
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
