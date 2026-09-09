import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { ProjectsService } from '../projects/projects.service';
import { SchedulerService } from './scheduler.service';

const createJobBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(
      /^[a-z][a-z0-9_-]*$/,
      'Use lowercase letters, digits, hyphens and underscores, starting with a letter',
    ),
  functionId: z.string().uuid(),
  cronExpression: z.string().min(1),
  enabled: z.boolean().optional(),
  projectId: z.string().uuid().optional(),
});

const updateJobBodySchema = z.object({
  functionId: z.string().uuid().optional(),
  cronExpression: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

// Admin-scoped scheduler API: CRUD + run-now for the /admin/scheduler page (Phase 13 #4). Every
// route is project-scoped via an optional ?projectId= query param (POST takes it in the JSON
// body instead), falling back to the default project when omitted — same convention as
// FunctionsAdminController/VaultAdminController.
@Controller('admin/v1/scheduler')
@UseGuards(AdminSessionGuard)
export class SchedulerAdminController {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly projects: ProjectsService,
  ) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    const project = projectId
      ? await this.projects.getById(projectId)
      : await this.projects.getDefault();
    return project.id;
  }

  @Get('jobs')
  async list(@Query('projectId') projectId?: string) {
    return { jobs: await this.scheduler.list(await this.resolveProjectId(projectId)) };
  }

  @Post('jobs')
  async create(@Body() body: unknown) {
    const parsed = createJobBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const projectId = await this.resolveProjectId(parsed.data.projectId);
    return this.scheduler.create(
      projectId,
      parsed.data.name,
      parsed.data.functionId,
      parsed.data.cronExpression,
      parsed.data.enabled ?? true,
    );
  }

  @Patch('jobs/:id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateJobBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.scheduler.update(id, parsed.data);
  }

  @Delete('jobs/:id')
  async remove(@Param('id') id: string) {
    return this.scheduler.delete(id);
  }

  @Get('jobs/:id/runs')
  async runs(@Param('id') id: string) {
    return { runs: await this.scheduler.listRuns(id) };
  }

  @Post('jobs/:id/run-now')
  async runNow(@Param('id') id: string) {
    await this.scheduler.runNow(id);
    return { started: true };
  }
}
