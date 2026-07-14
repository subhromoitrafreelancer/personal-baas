import { Injectable, Logger } from '@nestjs/common';
import { AuthAuditEventsRepository } from './auth-audit-events.repository';

@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  constructor(private readonly auditEventsRepo: AuthAuditEventsRepository) {}

  // Fire-and-forget: an audit-write failure must never fail the auth flow it's recording.
  record(
    userId: string | null,
    eventType: string,
    ipAddress: string | null,
    userAgent: string | null,
    metadata: Record<string, unknown> = {},
  ): void {
    this.auditEventsRepo
      .create(userId, eventType, ipAddress, userAgent, metadata)
      .catch((err) => this.logger.error({ msg: 'failed to record auth audit event', eventType, err }));
  }
}
