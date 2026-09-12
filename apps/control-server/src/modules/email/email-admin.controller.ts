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
import { ProjectsService } from '../projects/projects.service';
import { EmailService } from './email.service';
import { EmailProviderConfigRow } from './email.types';

const saveConfigBodySchema = z
  .object({
    provider: z.enum(['resend', 'smtp']),
    fromAddress: z.string().email(),
    smtpHost: z.string().min(1).optional(),
    smtpPort: z.coerce.number().int().positive().optional(),
    smtpSecure: z.boolean().optional(),
    smtpUsername: z.string().min(1).optional(),
    enabled: z.boolean().default(true),
    projectId: z.string().uuid().optional(),
  })
  .refine((body) => body.provider !== 'smtp' || (body.smtpHost && body.smtpPort), {
    message: 'smtpHost and smtpPort are required when provider is "smtp"',
  });

const setSecretBodySchema = z.object({
  value: z.string().min(1),
  projectId: z.string().uuid().optional(),
});

function toPublicConfig(row: EmailProviderConfigRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    fromAddress: row.from_address,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecure: row.smtp_secure,
    smtpUsername: row.smtp_username,
    enabled: row.enabled,
    updatedAt: row.updated_at.toISOString(),
  };
}

// Admin-scoped email API for the /admin/email page. Every route is project-scoped via an
// optional ?projectId= query param, falling back to the default project when omitted — same
// convention as VaultAdminController/FunctionsAdminController. The provider's own secret
// (API key / SMTP password) is never returned by any route here — it lives in the project's
// Vault namespace (EmailService.setSecret() writes it there directly) and this controller has no
// endpoint that reads it back, matching Vault's own write-only-reveal semantics (scope.md §30
// point 4, reused verbatim by §32 point 3).
@Controller('admin/v1/email')
@UseGuards(AdminSessionGuard)
export class EmailAdminController {
  constructor(
    private readonly email: EmailService,
    private readonly projects: ProjectsService,
  ) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    const project = projectId
      ? await this.projects.getById(projectId)
      : await this.projects.getDefault();
    return project.id;
  }

  @Get()
  async getConfig(@Query('projectId') projectId?: string) {
    const config = await this.email.getConfig(await this.resolveProjectId(projectId));
    return { config: toPublicConfig(config) };
  }

  @Post()
  async saveConfig(@Body() body: unknown) {
    const parsed = saveConfigBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const projectId = await this.resolveProjectId(parsed.data.projectId);
    const row = await this.email.saveConfig(projectId, {
      provider: parsed.data.provider,
      fromAddress: parsed.data.fromAddress,
      smtpHost: parsed.data.smtpHost ?? null,
      smtpPort: parsed.data.smtpPort ?? null,
      smtpSecure: parsed.data.smtpSecure ?? null,
      smtpUsername: parsed.data.smtpUsername ?? null,
      enabled: parsed.data.enabled,
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
    await this.email.setSecret(projectId, parsed.data.value, req.admin!.email);
    return { saved: true };
  }

  @Get('sent')
  async listSent(@Query('projectId') projectId?: string) {
    const rows = await this.email.listSent(await this.resolveProjectId(projectId));
    return {
      messages: rows.map((row) => ({
        id: row.id,
        toAddress: row.to_address,
        subject: row.subject,
        provider: row.provider,
        status: row.status,
        providerMessageId: row.provider_message_id,
        error: row.error,
        createdAt: row.created_at.toISOString(),
      })),
    };
  }
}
