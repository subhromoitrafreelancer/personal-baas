import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ProjectsService } from '../projects/projects.service';
import { normalizeSitePath } from './hosting-path.util';
import { HostingService } from './hosting.service';

// Public static site serving (Phase 11, scope.md §25) -- deliberately no guard: a browser loads
// this with no token, same as any static host. Reached only via the sites.<domain> Caddy host
// (Phase 25, scope.md §39 -- deliberately a *different* origin from /admin/* and everything else,
// since deployed site content is tenant-controlled, not platform-controlled). The route path
// itself is unchanged from Phase 11 (Caddy switches on Host, not path, to reach this controller),
// so a deployed site calling this deployment's /rest/v1/*, /auth/v1/*, /storage/v1/*,
// /functions/v1/* crosses origins and relies on their CORS configuration (PostgREST's own
// permissive default, and `cors({ origin: true })` in main.ts for the other three) rather than
// same-origin-by-construction as before.
@Controller('sites')
export class HostingServeController {
  constructor(
    private readonly hosting: HostingService,
    private readonly projects: ProjectsService,
  ) {}

  // Handles the bare site root (`/sites/<slug>` with no trailing path) separately from the
  // wildcard route below -- Express 5's `*path` wildcard doesn't reliably capture "nothing" the
  // same way across a bare path vs. a trailing slash, so this is the one unambiguous match for
  // "serve index.html".
  @Get(':project')
  async serveRoot(@Param('project') project: string, @Res() res: Response): Promise<void> {
    await this.serve(project, [], res);
  }

  @Get(':project/*path')
  async serveFile(
    @Param('project') project: string,
    @Param('path') path: string[] | string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.serve(project, normalizeSitePath(path), res);
  }

  private async serve(projectSlug: string, pathSegments: string[], res: Response): Promise<void> {
    const project = await this.projects.findBySlug(projectSlug);
    if (!project) {
      throw new NotFoundException(`Site "${projectSlug}" not found`);
    }
    const { stream, contentType, size } = await this.hosting.serveFile(project.id, pathSegments);
    res.setHeader('Content-Type', contentType ?? 'application/octet-stream');
    res.setHeader('Content-Length', size);
    stream.pipe(res);
  }
}
