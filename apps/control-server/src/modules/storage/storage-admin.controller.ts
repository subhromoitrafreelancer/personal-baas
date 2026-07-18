import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { z } from 'zod';
import { MulterErrorFilter } from '../../common/multer-error.filter';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { ProjectsService } from '../projects/projects.service';
import { normalizeObjectPath } from './storage-path.util';
import { STORAGE_MAX_UPLOAD_BYTES } from './storage-upload-limit';
import { StorageService } from './storage.service';

const createBucketBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, 'Use lowercase letters, digits and hyphens'),
  public: z.boolean().default(false),
  sizeLimitBytes: z.number().int().positive().nullable().default(null),
  projectId: z.string().uuid().optional(),
});

// Admin-scoped storage API: bucket management, plus object browse/manual-upload/download for
// the /admin/storage test page (Phase 7 #6). Admin requests carry no application-user JWT, so
// they go through StorageService as `{ kind: 'admin' }` — full access, no ownership concept,
// same trust level as service_role — never through the app-facing /storage/v1/object routes.
//
// Every route is project-scoped (Phase 10, scope.md §24) via an optional ?projectId= query
// param (POST buckets takes it in the JSON body instead), falling back to the default project
// when omitted — same convention as ApiKeysController/ApiKeysService, so the admin console's
// project selector (Phase 9 #7 pattern) works identically across both pages.
@Controller('admin/v1/storage')
@UseGuards(AdminSessionGuard)
export class StorageAdminController {
  constructor(
    private readonly storage: StorageService,
    private readonly projects: ProjectsService,
  ) {}

  private async resolveProjectId(projectId?: string): Promise<string> {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();
    return project.id;
  }

  @Get('buckets')
  async listBuckets(@Query('projectId') projectId?: string) {
    return { buckets: await this.storage.listBuckets(await this.resolveProjectId(projectId)) };
  }

  @Get('stats')
  async stats() {
    return this.storage.getStats();
  }

  @Post('buckets')
  async createBucket(@Body() body: unknown) {
    const parsed = createBucketBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const projectId = await this.resolveProjectId(parsed.data.projectId);
    return this.storage.createBucket(projectId, parsed.data.name, parsed.data.public, parsed.data.sizeLimitBytes);
  }

  @Get('buckets/:bucket/objects')
  async listObjects(@Param('bucket') bucket: string, @Query('projectId') projectId?: string) {
    return { objects: await this.storage.listObjects(await this.resolveProjectId(projectId), bucket) };
  }

  @Post('buckets/:bucket/objects/*path')
  @UseFilters(MulterErrorFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: STORAGE_MAX_UPLOAD_BYTES } }))
  async uploadObject(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('projectId') projectId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required (field name "file")');
    }
    return this.storage.uploadObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: { kind: 'admin', projectId: await this.resolveProjectId(projectId) },
      buffer: file.buffer,
      contentType: file.mimetype || null,
    });
  }

  @Get('buckets/:bucket/objects/*path')
  async downloadObject(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @Res() res: Response,
    @Query('projectId') projectId?: string,
  ) {
    const { stream, contentType, size } = await this.storage.downloadObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: { kind: 'admin', projectId: await this.resolveProjectId(projectId) },
    });
    res.setHeader('Content-Type', contentType ?? 'application/octet-stream');
    res.setHeader('Content-Length', size);
    stream.pipe(res);
  }

  @Delete('buckets/:bucket/objects/*path')
  async deleteObject(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @Query('projectId') projectId?: string,
  ) {
    await this.storage.deleteObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: { kind: 'admin', projectId: await this.resolveProjectId(projectId) },
    });
    return { deleted: true };
  }
}
