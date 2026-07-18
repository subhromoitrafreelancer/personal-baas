import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterErrorFilter } from '../../common/multer-error.filter';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { ProjectsService } from '../projects/projects.service';
import { HOSTING_MAX_DEPLOY_BYTES } from './hosting-upload-limit';
import { HostingService } from './hosting.service';

// Admin-scoped hosting API: deploy + stats for the /admin/hosting page (Phase 11 #5). Every
// route is project-scoped via an optional ?projectId= query param, falling back to the default
// project when omitted -- same convention as ApiKeysController/StorageAdminController (Phase 10),
// not the :project path-segment originally sketched in scope.md's first draft of this design.
@Controller('admin/v1/hosting')
@UseGuards(AdminSessionGuard)
export class HostingAdminController {
  constructor(
    private readonly hosting: HostingService,
    private readonly projects: ProjectsService,
  ) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();
    return project.id;
  }

  @Get()
  async stats(@Query('projectId') projectId?: string) {
    return this.hosting.getStats(await this.resolveProjectId(projectId));
  }

  @Post('deploy')
  @UseFilters(MulterErrorFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HOSTING_MAX_DEPLOY_BYTES } }))
  async deploy(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('projectId') projectId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A zip file is required (field name "file")');
    }
    return this.hosting.deploy(await this.resolveProjectId(projectId), file.buffer);
  }
}
