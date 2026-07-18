import { Controller, Post, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { RequestWithUser } from '../auth/auth.types';
import { ProjectsService } from '../projects/projects.service';
import { FunctionsService } from './functions.service';

function toStringRecord(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

// Public function invocation (Phase 12, scope.md §26 point 1) — HTTP-invoked only in v1, same
// AccessTokenGuard-authenticated + JWT-projectId-resolved shape as /storage/v1/*. The
// FunctionsService.getByProjectAndNameOrThrow lookup below (project_id + name) is the actual
// cross-project isolation boundary (§26 point 7a): a project-A JWT can never even resolve a
// project-B function's row, let alone invoke it.
@Controller('functions/v1')
@UseGuards(AccessTokenGuard)
export class FunctionsInvokeController {
  constructor(
    private readonly functions: FunctionsService,
    private readonly projects: ProjectsService,
  ) {}

  @Post(':name')
  async invoke(@Param('name') name: string, @Req() req: RequestWithUser, @Res() res: Response): Promise<void> {
    const user = req.user!;
    const project = await this.projects.getById(user.projectId);
    const fn = await this.functions.getByProjectAndNameOrThrow(project.id, name);

    const result = await this.functions.invoke({
      fn,
      project: { id: project.id, slug: project.slug, schemaName: project.schema_name },
      auth: { sub: user.sub, role: user.role, email: user.email },
      body: req.body,
      headers: toStringRecord(req.headers as Record<string, unknown>),
      query: toStringRecord(req.query as Record<string, unknown>),
      callerAuthorization: req.headers.authorization ?? null,
    });

    switch (result.kind) {
      case 'success': {
        if (result.headers) {
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value);
          }
        }
        res.status(result.status).json(result.body ?? null);
        return;
      }
      case 'function-error':
        res.status(500).json({ message: result.message });
        return;
      case 'timeout':
        res.status(504).json({ message: 'Function execution timed out' });
        return;
      case 'unavailable':
        res.status(503).json({ message: 'Function execution service unavailable' });
        return;
    }
  }
}
