import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  Delete,
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
import { createHash, randomBytes } from 'node:crypto';
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
export const generateCredential = () => randomBytes(48).toString('base64url');
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
  // Feature-flag probe for the admin page: deliberately does not 404 when the feature is off,
  // so /admin/workers can render an explanatory state instead of an error.
  @Get()
  @Header('Cache-Control', 'no-store')
  async list() {
    if (!this.config.get('WORKER_INTEGRATIONS_ENABLED', { infer: true }))
      return { featureEnabled: false, integrations: [] };
    return { featureEnabled: true, integrations: await this.repo.list() };
  }
  @Get(':integration')
  @Header('Cache-Control', 'no-store')
  async detail(@Param('integration') integration: string) {
    this.enabled();
    return this.repo.detail(parse(uuid, integration));
  }
  // `credential` is optional: when omitted the server generates one (48 random bytes,
  // base64url = 64 chars) and returns it exactly once. Only its SHA-256 is stored.
  @Post()
  @Header('Cache-Control', 'no-store')
  async register(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    this.enabled();
    const data = parse(
      z
        .object({
          name: z.string().min(1).max(100),
          credential: z
            .string()
            .regex(/^[A-Za-z0-9_-]{43,128}$/)
            .optional(),
        })
        .strict(),
      body,
    );
    const generated = data.credential === undefined;
    const credential = data.credential ?? generateCredential();
    const result = await this.repo.register(data.name, credentialHash(credential));
    this.audit.record(null, 'worker.integration_registered', null, null, {
      integrationId: result.id,
      generated,
      by: req.admin!.email,
    });
    return generated ? { ...result, credential } : result;
  }
  @Post(':integration/enable')
  async enable(@Param('integration') integration: string, @Req() req: RequestWithAdmin) {
    this.enabled();
    const result = await this.repo.enable(parse(uuid, integration));
    this.audit.record(null, 'worker.integration_enabled', null, null, {
      integrationId: integration,
      by: req.admin!.email,
    });
    return result;
  }
  // Hard swap: the previous credential stops authenticating immediately. Issued leases and
  // their API keys are unaffected (they are separate credentials); revoke them explicitly.
  @Post(':integration/credential')
  @Header('Cache-Control', 'no-store')
  async rotate(@Param('integration') integration: string, @Req() req: RequestWithAdmin) {
    this.enabled();
    const credential = generateCredential();
    await this.repo.rotateCredential(parse(uuid, integration), credentialHash(credential));
    this.audit.record(null, 'worker.credential_rotated', null, null, {
      integrationId: integration,
      by: req.admin!.email,
    });
    return { credential };
  }
  @Post(':integration/leases/:lease/revoke')
  async revokeLease(
    @Param('integration') integration: string,
    @Param('lease') lease: string,
    @Req() req: RequestWithAdmin,
  ) {
    this.enabled();
    const result = await this.repo.revokeLease(parse(uuid, integration), parse(uuid, lease));
    this.audit.record(null, 'worker.lease_revoked', null, null, {
      integrationId: integration,
      leaseId: lease,
      by: req.admin!.email,
    });
    return result;
  }
  @Delete(':integration')
  async remove(@Param('integration') integration: string, @Req() req: RequestWithAdmin) {
    this.enabled();
    const result = await this.repo.remove(parse(uuid, integration));
    this.audit.record(null, 'worker.integration_deleted', null, null, {
      integrationId: integration,
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
