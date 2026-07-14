import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { MulterErrorFilter } from './multer-error.filter';
import {
  cancelRequestSchema,
  executeRequestSchema,
  MAX_UPLOAD_BYTES,
  uploadFieldsSchema,
} from './sql-execute.dto';
import { SqlConsoleService } from './sql-console.service';

@Controller('admin/v1/sql')
@UseGuards(AdminSessionGuard)
export class SqlConsoleController {
  constructor(private readonly sqlConsole: SqlConsoleService) {}

  @Post('execute')
  @HttpCode(200)
  async execute(@Body() body: unknown, @Req() req: RequestWithAdmin) {
    const parsed = executeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    // Guarded by AdminSessionGuard, which always sets req.admin before the handler runs.
    return this.sqlConsole.execute(parsed.data, req.admin!);
  }

  @Post('cancel')
  @HttpCode(200)
  async cancel(@Body() body: unknown) {
    const parsed = cancelRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const cancelled = await this.sqlConsole.cancel(parsed.data.executionId);
    return { cancelled };
  }

  @Post('upload')
  @HttpCode(200)
  @UseFilters(MulterErrorFilter)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
    @Req() req: RequestWithAdmin,
  ) {
    if (!file) {
      throw new BadRequestException('A .sql file is required (field name "file")');
    }
    const fields = uploadFieldsSchema.safeParse(body);
    if (!fields.success) {
      throw new BadRequestException(fields.error.flatten());
    }

    // Uploaded scripts always run in script mode — feeds straight into the same
    // split/execute/history/redaction pipeline as POST /admin/v1/sql/execute.
    return this.sqlConsole.execute(
      {
        sql: file.buffer.toString('utf-8'),
        mode: 'script',
        rowLimit: fields.data.rowLimit,
        statementTimeoutMs: fields.data.statementTimeoutMs,
        executionId: fields.data.executionId,
      },
      req.admin!,
    );
  }
}
