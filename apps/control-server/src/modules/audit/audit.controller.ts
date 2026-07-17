import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { AuthAuditEventsRepository } from '../auth/auth-audit-events.repository';
import { paginationQuerySchema } from '../../common/pagination.dto';

@Controller('admin/v1/audit')
@UseGuards(AdminSessionGuard)
export class AuditController {
  constructor(private readonly auditEventsRepo: AuthAuditEventsRepository) {}

  @Get()
  async list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const parsed = paginationQuerySchema.safeParse({ limit, offset });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    const { rows, total } = await this.auditEventsRepo.list(parsed.data.limit, parsed.data.offset);
    return {
      events: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email ?? null,
        eventType: row.event_type,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        metadata: row.metadata,
        createdAt: row.created_at.toISOString(),
      })),
      total,
    };
  }
}
