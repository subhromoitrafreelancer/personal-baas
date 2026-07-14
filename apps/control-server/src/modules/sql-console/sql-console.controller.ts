import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { cancelRequestSchema, executeRequestSchema } from './sql-execute.dto';
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
}
