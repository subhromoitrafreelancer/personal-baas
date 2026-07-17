import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
});

// Admin-scoped storage API: bucket management, plus object browse/manual-upload/download for
// the /admin/storage test page (Phase 7 #6). Admin requests carry no application-user JWT, so
// they go through StorageService as `{ kind: 'admin' }` — full access, no ownership concept,
// same trust level as service_role — never through the app-facing /storage/v1/object routes.
@Controller('admin/v1/storage')
@UseGuards(AdminSessionGuard)
export class StorageAdminController {
  constructor(private readonly storage: StorageService) {}

  @Get('buckets')
  async listBuckets() {
    return { buckets: await this.storage.listBuckets() };
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
    return this.storage.createBucket(parsed.data.name, parsed.data.public, parsed.data.sizeLimitBytes);
  }

  @Get('buckets/:bucket/objects')
  async listObjects(@Param('bucket') bucket: string) {
    return { objects: await this.storage.listObjects(bucket) };
  }

  @Post('buckets/:bucket/objects/*path')
  @UseFilters(MulterErrorFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: STORAGE_MAX_UPLOAD_BYTES } }))
  async uploadObject(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required (field name "file")');
    }
    return this.storage.uploadObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: { kind: 'admin' },
      buffer: file.buffer,
      contentType: file.mimetype || null,
    });
  }

  @Get('buckets/:bucket/objects/*path')
  async downloadObject(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @Res() res: Response,
  ) {
    const { stream, contentType, size } = await this.storage.downloadObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: { kind: 'admin' },
    });
    res.setHeader('Content-Type', contentType ?? 'application/octet-stream');
    res.setHeader('Content-Length', size);
    stream.pipe(res);
  }

  @Delete('buckets/:bucket/objects/*path')
  async deleteObject(@Param('bucket') bucket: string, @Param('path') path: string[] | string) {
    await this.storage.deleteObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: { kind: 'admin' },
    });
    return { deleted: true };
  }
}
