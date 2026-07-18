import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ProjectsService } from '../projects/projects.service';
import { normalizeSitePath } from './hosting-path.util';
import { HostingService } from './hosting.service';

// Public static site serving (Phase 11, scope.md §25) -- deliberately no guard: a browser loads
// this with no token, same as any static host. Path-based routing (not subdomain) means a
// deployed site calling this same deployment's /rest/v1/*, /auth/v1/*, /storage/v1/*,
// /functions/v1/* needs no CORS configuration at all -- same-origin by construction.
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
