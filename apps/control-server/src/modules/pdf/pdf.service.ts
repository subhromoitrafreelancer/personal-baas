import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '../../config/env.schema';
import { StorageService } from '../storage/storage.service';
import { VaultService } from '../vault/vault.service';
import { buildPdfProvider } from './pdf-provider.factory';
import {
  PdfProviderConfigsRepository,
  UpsertPdfProviderConfigInput,
} from './pdf-provider-configs.repository';
import { PdfRenderRequestsRepository } from './pdf-render-requests.repository';
import { PDF_PROVIDER_SECRET_NAME, PdfRenderOptions } from './pdf.types';

export interface PdfRenderOutcome {
  status: 'success' | 'failed';
  buffer: Buffer | null;
  error: string | null;
  reason: 'not_configured' | 'too_large' | 'provider_error' | null;
}

@Injectable()
export class PdfService {
  constructor(
    private readonly configs: PdfProviderConfigsRepository,
    private readonly requests: PdfRenderRequestsRepository,
    private readonly vault: VaultService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  getConfig(projectId: string) {
    return this.configs.findByProjectId(projectId);
  }

  saveConfig(projectId: string, input: UpsertPdfProviderConfigInput) {
    return this.configs.upsert(projectId, input);
  }

  setSecret(projectId: string, value: string, adminEmail: string) {
    return this.vault.upsert(projectId, PDF_PROVIDER_SECRET_NAME, value, adminEmail);
  }

  listRequests(projectId: string, limit = 50) {
    return this.requests.listByProject(projectId, limit);
  }

  // The one method that ever actually renders a PDF — never throws. Every caller gets a plain
  // result object and a durable pdf.render_requests row regardless of outcome, mirroring
  // EmailService.send()'s shape (scope.md §32 points 7-8, applied here per §34).
  async render(
    projectId: string,
    html: string,
    options?: PdfRenderOptions,
  ): Promise<PdfRenderOutcome> {
    const maxHtmlBytes = this.config.get('PDF_MAX_HTML_BYTES', { infer: true });
    if (Buffer.byteLength(html, 'utf8') > maxHtmlBytes) {
      return this.recordAndReturn(
        projectId,
        'failed',
        null,
        null,
        `HTML input exceeds the ${maxHtmlBytes}-byte limit`,
        'too_large',
      );
    }

    const config = await this.configs.findByProjectId(projectId);
    if (!config || !config.enabled) {
      return this.recordAndReturn(
        projectId,
        'failed',
        null,
        null,
        'PDF generation is not configured for this project',
        'not_configured',
      );
    }

    const secret = config.auth_header
      ? await this.vault.resolveForFunction(projectId, PDF_PROVIDER_SECRET_NAME)
      : null;

    const timeoutMs = this.config.get('PDF_TIMEOUT_MS', { infer: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const provider = buildPdfProvider(config, secret);
      const buffer = await provider.render(html, { ...options, signal: controller.signal });

      const maxOutputBytes = this.config.get('PDF_MAX_OUTPUT_BYTES', { infer: true });
      if (buffer.length > maxOutputBytes) {
        return this.recordAndReturn(
          projectId,
          'failed',
          Date.now() - start,
          buffer.length,
          `Rendered PDF exceeds the ${maxOutputBytes}-byte limit`,
          'provider_error',
        );
      }

      return this.recordAndReturn(
        projectId,
        'success',
        Date.now() - start,
        buffer.length,
        null,
        null,
        buffer,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return this.recordAndReturn(
        projectId,
        'failed',
        Date.now() - start,
        null,
        errorMessage,
        'provider_error',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // Used by ctx.pdf.render()/ctx.pdf.renderToStorage() (scope.md §34 point 8) — a Function
  // should see a real, immediate error when its project's PDF generation isn't usable, not a
  // silently-swallowed failure (mirrors EmailService.sendOrThrow()'s posture exactly).
  async renderOrThrow(
    projectId: string,
    html: string,
    options?: PdfRenderOptions,
  ): Promise<Buffer> {
    const outcome = await this.render(projectId, html, options);
    if (outcome.status === 'failed') {
      if (outcome.reason === 'not_configured') {
        throw new NotFoundException(outcome.error);
      }
      throw new BadGatewayException(outcome.error ?? 'Failed to render PDF');
    }
    return outcome.buffer!;
  }

  // Renders then writes through the existing internal storage-write path (scope.md §34 point
  // 9) — no new upload mechanism. Writes as a service-key-shaped requester (no owner
  // attribution, unconditional read/write access) since a Function-initiated render has no
  // single well-defined "owner" the way a real user's direct upload does.
  async renderToStorage(
    projectId: string,
    html: string,
    params: { bucket: string; path: string; options?: PdfRenderOptions },
  ) {
    const buffer = await this.renderOrThrow(projectId, html, params.options);
    return this.storage.uploadObject({
      bucketName: params.bucket,
      path: params.path,
      requester: { kind: 'service-key', role: 'service_role', projectId },
      buffer,
      contentType: 'application/pdf',
    });
  }

  private async recordAndReturn(
    projectId: string,
    status: 'success' | 'failed',
    durationMs: number | null,
    outputBytes: number | null,
    error: string | null,
    reason: PdfRenderOutcome['reason'],
    buffer: Buffer | null = null,
  ): Promise<PdfRenderOutcome> {
    await this.requests.record({ projectId, status, durationMs, outputBytes, error });
    return { status, buffer, error, reason };
  }
}
