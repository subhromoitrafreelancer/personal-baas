import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  RequestWithInvocationProject,
  VaultInvocationTokenGuard,
} from '../vault/vault-invocation-token.guard';
import { PdfService } from './pdf.service';

const renderBodySchema = z.object({
  html: z.string().min(1),
  format: z.string().optional(),
  margin: z.string().optional(),
});

const renderToStorageBodySchema = renderBodySchema.extend({
  bucket: z.string().min(1),
  path: z.string().min(1),
});

// Backs a function's ctx.pdf.render()/ctx.pdf.renderToStorage() calls (scope.md §34 point 8) —
// reached only from a function-runner worker's outbound callback, over the internal docker
// network. Reuses VaultInvocationTokenGuard as-is, same generic per-invocation-token mechanism
// already shared with ctx.secrets/ctx.email. Deliberately not added to
// infrastructure/proxy/Caddyfile's routing table (same precedent as the other /internal/* routes).
@Controller('internal/pdf')
@UseGuards(VaultInvocationTokenGuard)
export class PdfInternalController {
  constructor(private readonly pdf: PdfService) {}

  @Post('render')
  async render(@Body() body: unknown, @Req() req: RequestWithInvocationProject) {
    const parsed = renderBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    // Raw bytes can't travel cleanly over a JSON body — base64-encoded here, decoded back to a
    // Buffer by worker-entry.ts's buildPdfClient before reaching function code.
    const buffer = await this.pdf.renderOrThrow(req.invocationProjectId!, parsed.data.html, {
      format: parsed.data.format,
      margin: parsed.data.margin,
    });
    return { pdfBase64: buffer.toString('base64') };
  }

  @Post('render-to-storage')
  async renderToStorage(@Body() body: unknown, @Req() req: RequestWithInvocationProject) {
    const parsed = renderToStorageBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const object = await this.pdf.renderToStorage(req.invocationProjectId!, parsed.data.html, {
      bucket: parsed.data.bucket,
      path: parsed.data.path,
      options: { format: parsed.data.format, margin: parsed.data.margin },
    });
    return object;
  }
}
