import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { ProjectsService } from '../projects/projects.service';
import { VaultService } from './vault.service';

// Env-var-style naming (scope.md §30 point 2): a secret conceptually replaces a hardcoded
// credential inside function code, so ctx.secrets.get('STRIPE_API_KEY') should read the way
// process.env.STRIPE_API_KEY would.
const secretNameSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Z][A-Z0-9_]*$/, 'Use UPPER_SNAKE_CASE, e.g. STRIPE_API_KEY');

const upsertSecretBodySchema = z.object({
  name: secretNameSchema,
  value: z.string().min(1),
  projectId: z.string().uuid().optional(),
});

// Admin-scoped vault API: create-or-rotate, list, delete — for the /admin/vault page. Every
// route is project-scoped via an optional ?projectId= query param (POST takes it in the JSON
// body instead), falling back to the default project when omitted — same convention as
// FunctionsAdminController/HostingAdminController/StorageAdminController.
//
// Deliberately no GET :id / reveal endpoint of any kind, unlike ApiKeysController's reveal():
// a vault secret's value is supplied by the admin themselves (they already have it), so there
// is nothing to reveal after the fact (scope.md §30 point 4).
@Controller('admin/v1/vault')
@UseGuards(AdminSessionGuard)
export class VaultAdminController {
  constructor(
    private readonly vault: VaultService,
    private readonly projects: ProjectsService,
  ) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    const project = projectId
      ? await this.projects.getById(projectId)
      : await this.projects.getDefault();
    return project.id;
  }

  @Get()
  async list(@Query('projectId') projectId?: string) {
    return { secrets: await this.vault.list(await this.resolveProjectId(projectId)) };
  }

  @Post()
  async upsert(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = upsertSecretBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const projectId = await this.resolveProjectId(parsed.data.projectId);
    return this.vault.upsert(projectId, parsed.data.name, parsed.data.value, req.admin!.email);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('projectId') projectId: string | undefined,
    @Req() req: RequestWithAdmin,
  ) {
    return this.vault.delete(id, await this.resolveProjectId(projectId), req.admin!.email);
  }
}
