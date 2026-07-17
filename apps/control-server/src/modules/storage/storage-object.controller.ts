import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { MulterErrorFilter } from '../../common/multer-error.filter';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { RequestWithUser } from '../auth/auth.types';
import { normalizeObjectPath } from './storage-path.util';
import { STORAGE_MAX_UPLOAD_BYTES } from './storage-upload-limit';
import { StorageRequester, StorageService } from './storage.service';

function requesterFor(req: RequestWithUser): StorageRequester {
  const user = req.user!;
  return { kind: 'app-user', sub: user.sub, role: user.role };
}

// Public object API (Phase 7 #3/#4, scope.md §21) — the only storage surface application
// clients ever talk to. Every request carries an Authorization: Bearer JWT (this project's auth
// model has no separate apikey header, unlike Supabase), so AccessTokenGuard applies uniformly
// even for public-bucket reads; role (anon/authenticated/service_role) drives permission checks
// inside StorageService, not the guard itself.
@Controller('storage/v1/object')
@UseGuards(AccessTokenGuard)
export class StorageObjectController {
  constructor(private readonly storage: StorageService) {}

  @Post(':bucket/*path')
  @UseFilters(MulterErrorFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: STORAGE_MAX_UPLOAD_BYTES } }))
  async upload(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: RequestWithUser,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required (field name "file")');
    }
    return this.storage.uploadObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: requesterFor(req),
      buffer: file.buffer,
      contentType: file.mimetype || null,
    });
  }

  @Get(':bucket/*path')
  async download(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    const { stream, contentType, size } = await this.storage.downloadObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: requesterFor(req),
    });
    res.setHeader('Content-Type', contentType ?? 'application/octet-stream');
    res.setHeader('Content-Length', size);
    stream.pipe(res);
  }

  @Delete(':bucket/*path')
  async remove(
    @Param('bucket') bucket: string,
    @Param('path') path: string[] | string,
    @Req() req: RequestWithUser,
  ) {
    await this.storage.deleteObject({
      bucketName: bucket,
      path: normalizeObjectPath(path),
      requester: requesterFor(req),
    });
    return { deleted: true };
  }
}
