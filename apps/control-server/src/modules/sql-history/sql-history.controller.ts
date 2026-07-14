import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { SqlHistoryService } from './sql-history.service';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

@Controller('admin/v1/sql/history')
@UseGuards(AdminSessionGuard)
export class SqlHistoryController {
  constructor(private readonly sqlHistory: SqlHistoryService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.sqlHistory.list(parsed.data.limit, parsed.data.offset);
  }
}
