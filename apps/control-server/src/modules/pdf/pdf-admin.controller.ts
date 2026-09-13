import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { AuthAuditService } from '../auth/auth-audit.service';
import { ProjectsService } from '../projects/projects.service';
import { PdfService } from './pdf.service';
import { PdfProviderConfigRow } from './pdf.types';

const saveConfigBodySchema = z.object({
  apiUrl: z.string().url(),
  authHeader: z.string().min(1).optional(),
  htmlField: z.string().min(1).default('html'),
  responseMode: z.enum(['binary', 'json_url', 'json_base64']).default('binary'),
  enabled: z.boolean().default(true),
  projectId: z.string().uuid().optional(),
});

const setSecretBodySchema = z.object({
  value: z.string().min(1),
  projectId: z.string().uuid().optional(),
});

function toPublicConfig(row: PdfProviderConfigRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    apiUrl: row.api_url,
    authHeader: row.auth_header,
    htmlField: row.html_field,
    responseMode: row.response_mode,
    enabled: row.enabled,
    updatedAt: row.updated_at.toISOString(),
  };
}

// Admin-scoped PDF API for the /admin/pdf page. Every route is project-scoped via an optional
// ?projectId= query param, falling back to the default project when omitted — same convention as
// EmailAdminController/VaultAdminController. The vendor secret is never returned by any route
// here — it lives in the project's Vault namespace (PdfService.setSecret() writes it there
// directly), matching Vault's own write-only-reveal semantics (scope.md §30 point 4).
@Controller('admin/v1/pdf')
@UseGuards(AdminSessionGuard)
export class PdfAdminController {
  constructor(
    private readonly pdf: PdfService,
    private readonly projects: ProjectsService,
    private readonly audit: AuthAuditService,
  ) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    const project = projectId
      ? await this.projects.getById(projectId)
      : await this.projects.getDefault();
    return project.id;
  }

  @Get()
  async getConfig(@Query('projectId') projectId?: string) {
    const config = await this.pdf.getConfig(await this.resolveProjectId(projectId));
    return { config: toPublicConfig(config) };
  }

  @Post()
  async saveConfig(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = saveConfigBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const projectId = await this.resolveProjectId(parsed.data.projectId);
    const row = await this.pdf.saveConfig(projectId, {
      apiUrl: parsed.data.apiUrl,
      authHeader: parsed.data.authHeader ?? null,
      htmlField: parsed.data.htmlField,
      responseMode: parsed.data.responseMode,
      enabled: parsed.data.enabled,
    });
    this.audit.record(null, 'pdf.provider_config_saved', null, null, {
      projectId,
      savedBy: req.admin!.email,
    });
    return { config: toPublicConfig(row) };
  }

  @Post('secret')
  async setSecret(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = setSecretBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const projectId = await this.resolveProjectId(parsed.data.projectId);
    await this.pdf.setSecret(projectId, parsed.data.value, req.admin!.email);
    return { saved: true };
  }

  @Get('requests')
  async listRequests(@Query('projectId') projectId?: string) {
    const rows = await this.pdf.listRequests(await this.resolveProjectId(projectId));
    return {
      requests: rows.map((row) => ({
        id: row.id,
        status: row.status,
        durationMs: row.duration_ms,
        outputBytes: row.output_bytes,
        error: row.error,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }
}
