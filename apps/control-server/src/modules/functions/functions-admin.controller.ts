import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { ProjectsService } from '../projects/projects.service';
import { FunctionsRepository } from './functions.repository';
import { FunctionsService } from './functions.service';

const createFunctionBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z][a-z0-9_-]*$/, 'Use lowercase letters, digits, hyphens and underscores, starting with a letter'),
  code: z.string().min(1),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
  projectId: z.string().uuid().optional(),
});

const updateFunctionBodySchema = z.object({
  code: z.string().min(1).optional(),
  timeoutMs: z.number().int().positive().max(60_000).optional(),
});

const invokeBodySchema = z.object({
  body: z.unknown().optional(),
});

// Admin-scoped functions API: CRUD + a test-invoke endpoint for the /admin/functions page
// (Phase 12 #6). Every route is project-scoped via an optional ?projectId= query param (POST
// takes it in the JSON body instead), falling back to the default project when omitted — same
// convention as StorageAdminController/HostingAdminController (Phase 10/11).
@Controller('admin/v1/functions')
@UseGuards(AdminSessionGuard)
export class FunctionsAdminController {
  constructor(
    private readonly functions: FunctionsService,
    private readonly functionsRepo: FunctionsRepository,
    private readonly projects: ProjectsService,
  ) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();
    return project.id;
  }

  @Get()
  async list(@Query('projectId') projectId?: string) {
    return { functions: await this.functions.list(await this.resolveProjectId(projectId)) };
  }

  @Post()
  async create(@Body() body: unknown) {
    const parsed = createFunctionBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const projectId = await this.resolveProjectId(parsed.data.projectId);
    return this.functions.create(projectId, parsed.data.name, parsed.data.code, parsed.data.timeoutMs ?? null);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateFunctionBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.functions.update(id, parsed.data);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.functions.delete(id);
  }

  @Get(':id/invocations')
  async invocations(@Param('id') id: string) {
    return { invocations: await this.functions.listInvocations(id) };
  }

  // Runs the same execution path a real client would hit, but with no real invoking user — the
  // admin console has no application-user JWT to forward, so ctx.auth is null and ctx.rest calls
  // reach PostgREST with no Authorization header (PostgREST falls back to its configured anon
  // role), same as any other unauthenticated caller.
  @Post(':id/invoke')
  async invoke(@Param('id') id: string, @Body() body: unknown) {
    const parsed = invokeBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const fn = await this.functionsRepo.findById(id);
    if (!fn) {
      throw new BadRequestException('Function not found');
    }
    const project = await this.projects.getById(fn.project_id);
    return this.functions.invoke({
      fn,
      project: { id: project.id, slug: project.slug, schemaName: project.schema_name },
      auth: null,
      body: parsed.data.body ?? null,
      headers: {},
      query: {},
      callerAuthorization: null,
    });
  }
}
