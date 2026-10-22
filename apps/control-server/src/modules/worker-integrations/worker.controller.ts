import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EnvConfig } from '../../config/env.schema';
import { AuthAuditService } from '../auth/auth-audit.service';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { WorkerRepository } from './worker.repository';
import { WorkerService } from './worker.service';
const uuid = z.string().uuid();
const secretName = z.string().regex(/^[A-Z][A-Z0-9_]{0,199}$/);
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw new BadRequestException('Invalid worker request');
  return p.data;
}
export const credentialHash = (value: string) => createHash('sha256').update(value).digest('hex');
interface WorkerRequest extends Request {
  workerIntegration?: string;
}
@Injectable()
export class WorkerGuard implements CanActivate {
  constructor(
    private readonly repo: WorkerRepository,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.config.get('WORKER_INTEGRATIONS_ENABLED', { infer: true }))
      throw new NotFoundException();
    const req = ctx.switchToHttp().getRequest<WorkerRequest>();
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
    const id = token ? await this.repo.authenticate(credentialHash(token)) : null;
    if (!id) throw new UnauthorizedException('Worker authentication required');
    req.workerIntegration = id;
    return true;
  }
}
@Controller('internal/worker/v1')
@UseGuards(WorkerGuard)
export class WorkerController {
  constructor(
    private readonly repo: WorkerRepository,
    private readonly service: WorkerService,
  ) {}
  @Get('projects')
  @Header('Cache-Control', 'no-store')
  async projects(@Req() req: WorkerRequest) {
    return { projects: await this.repo.projects(req.workerIntegration!) };
  }
  @Post('projects/:project/leases')
  @Header('Cache-Control', 'no-store')
  async lease(@Req() req: WorkerRequest, @Param('project') project: string) {
    return this.service.lease(req.workerIntegration!, parse(uuid, project), null);
  }
  @Post('leases/:lease/renew')
  @Header('Cache-Control', 'no-store')
  async renew(@Req() req: WorkerRequest, @Param('lease') lease: string) {
    return this.service.lease(req.workerIntegration!, null, parse(uuid, lease));
  }
  @Post('leases/:lease/secrets/resolve')
  @Header('Cache-Control', 'no-store')
  async resolve(@Req() req: WorkerRequest, @Param('lease') lease: string, @Body() body: unknown) {
    const data = parse(z.object({ name: secretName }).strict(), body);
    return this.service.resolve(req.workerIntegration!, parse(uuid, lease), data.name);
  }
}
@Controller('admin/v1/worker-integrations')
@UseGuards(AdminSessionGuard)
export class WorkerAdminController {
  constructor(
    private readonly repo: WorkerRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly audit: AuthAuditService,
  ) {}
  private enabled() {
    if (!this.config.get('WORKER_INTEGRATIONS_ENABLED', { infer: true }))
      throw new NotFoundException();
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  async register(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    this.enabled();
    const data = parse(
      z
        .object({
          name: z.string().min(1).max(100),
          credential: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
        })
        .strict(),
      body,
    );
    const result = await this.repo.register(data.name, credentialHash(data.credential));
    this.audit.record(null, 'worker.integration_registered', null, null, {
      integrationId: result.id,
      by: req.admin!.email,
    });
    return result;
  }
  @Post(':integration/grants')
  async grant(
    @Param('integration') integration: string,
    @Body() body: unknown,
    @Req() req: RequestWithAdmin,
  ) {
    this.enabled();
    const data = parse(
      z
        .object({
          project_id: uuid,
          allowed_secret_names: z.array(secretName).max(100),
          enabled: z.boolean(),
        })
        .strict(),
      body,
    );
    const result = await this.repo.grant(
      parse(uuid, integration),
      data.project_id,
      data.allowed_secret_names,
      data.enabled,
    );
    this.audit.record(null, 'worker.grant_updated', null, null, {
      integrationId: integration,
      projectId: data.project_id,
      enabled: data.enabled,
      by: req.admin!.email,
    });
    return result;
  }
  @Post(':integration/disable')
  async disable(@Param('integration') integration: string, @Req() req: RequestWithAdmin) {
    this.enabled();
    const result = await this.repo.disable(parse(uuid, integration));
    this.audit.record(null, 'worker.integration_disabled', null, null, {
      integrationId: integration,
      by: req.admin!.email,
    });
    return result;
  }
}
