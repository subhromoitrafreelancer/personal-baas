import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { AuthAuditEventsRepository } from '../auth/auth-audit-events.repository';

@Controller('admin/v1/audit')
@UseGuards(AdminSessionGuard)
export class AuditController {
  constructor(private readonly auditEventsRepo: AuthAuditEventsRepository) {}

  @Get()
  async list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const { rows, total } = await this.auditEventsRepo.list(
      Math.min(Number(limit) || 50, 200),
      Number(offset) || 0,
    );
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
