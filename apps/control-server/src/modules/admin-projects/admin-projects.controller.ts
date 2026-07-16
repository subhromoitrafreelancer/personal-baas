import { BadRequestException, Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { ProjectRow } from '../projects/projects.repository';
import { ProjectsService } from '../projects/projects.service';

const createProjectBodySchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

function toPublicProject(row: ProjectRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    schemaName: row.schema_name,
    anonRole: row.anon_role,
    authenticatedRole: row.authenticated_role,
    serviceRoleRole: row.service_role_role,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Controller('admin/v1/projects')
@UseGuards(AdminSessionGuard)
export class AdminProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  async list() {
    const rows = await this.projects.list();
    return { projects: rows.map(toPublicProject) };
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createProjectBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const project = await this.projects.create(parsed.data);
    return {
      ...toPublicProject(project),
      // ProjectsService.create() already wrote postgrest.conf's db-schemas line (Phase 9 PR6)
      // — this only tells the admin console a restart is needed to make it take effect
      // (scope.md §23 point 7's manual-restart decision).
      restartCommand: 'docker compose restart postgrest',
    };
  }
}
