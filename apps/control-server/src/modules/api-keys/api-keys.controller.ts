import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { ApiKeysService } from './api-keys.service';

const createKeyBodySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['publishable', 'secret']),
  projectId: z.string().uuid().optional(),
});

const generateEnvBodySchema = z.object({
  projectId: z.string().uuid().optional(),
});

@Controller('admin/v1/api-keys')
@UseGuards(AdminSessionGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  async list(@Query('projectId') projectId?: string) {
    return { keys: await this.apiKeys.list(projectId) };
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = createKeyBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.apiKeys.create(parsed.data.name, parsed.data.kind, req.admin!.email, parsed.data.projectId);
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string, @Req() req: RequestWithAdmin) {
    return this.apiKeys.revoke(id, req.admin!.email);
  }

  @Post(':id/reveal')
  async reveal(@Param('id') id: string, @Req() req: RequestWithAdmin) {
    return this.apiKeys.reveal(id, req.admin!.email);
  }

  @Post('generate-env')
  async generateEnv(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = generateEnvBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.apiKeys.generateEnvBundle(req.admin!.email, parsed.data.projectId);
  }
}
