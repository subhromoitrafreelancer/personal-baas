import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  RequestWithInvocationProject,
  VaultInvocationTokenGuard,
} from './vault-invocation-token.guard';
import { VaultService } from './vault.service';

const resolveBodySchema = z.object({
  name: z.string().min(1),
});

// Backs a function's ctx.secrets.get(name) call (scope.md §30 point 5) — reached only from a
// function-runner worker's outbound callback (worker-entry.ts's buildSecretsClient), over the
// internal docker network. Deliberately not added to infrastructure/proxy/Caddyfile's routing
// table (same precedent as /metrics — "not routed through Caddy").
@Controller('internal/vault')
@UseGuards(VaultInvocationTokenGuard)
export class VaultInternalController {
  constructor(private readonly vault: VaultService) {}

  @Post('resolve')
  async resolve(@Body() body: unknown, @Req() req: RequestWithInvocationProject) {
    const parsed = resolveBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('name is required');
    }
    const value = await this.vault.resolveForFunction(req.invocationProjectId!, parsed.data.name);
    if (value === null) {
      throw new NotFoundException();
    }
    return { value };
  }
}
