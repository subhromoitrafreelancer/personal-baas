import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { EMAIL_SEND_THROTTLE } from '../rate-limit/route-throttles';
import {
  RequestWithInvocationProject,
  VaultInvocationTokenGuard,
} from '../vault/vault-invocation-token.guard';
import { EmailService } from './email.service';

const sendBodySchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().optional(),
  text: z.string().optional(),
});

// Backs a function's ctx.email.send(...) call (scope.md §32 point 8) — reached only from a
// function-runner worker's outbound callback, over the internal docker network. Reuses
// VaultInvocationTokenGuard as-is: the opaque per-invocation token it checks was never
// vault-specific in behavior (it only ever resolves an invocation to a project id), so the same
// token minted for one invocation authorizes both ctx.secrets.get() and ctx.email.send() calls
// within that invocation. Deliberately not added to infrastructure/proxy/Caddyfile's routing
// table (same precedent as /internal/vault/resolve and /metrics).
@Controller('internal/email')
@UseGuards(VaultInvocationTokenGuard)
export class EmailInternalController {
  constructor(private readonly email: EmailService) {}

  @Post('send')
  @Throttle(EMAIL_SEND_THROTTLE)
  async send(@Body() body: unknown, @Req() req: RequestWithInvocationProject) {
    const parsed = sendBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    return this.email.sendOrThrow(req.invocationProjectId!, parsed.data);
  }
}
