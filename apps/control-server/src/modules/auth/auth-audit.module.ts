import { Module } from '@nestjs/common';
import { AuthAuditEventsRepository } from './auth-audit-events.repository';
import { AuthAuditService } from './auth-audit.service';

// Split out from AuthModule so a module that only needs audit logging (VaultModule) can depend
// on just this, without pulling in the rest of AuthModule. Once AuthModule itself needed
// EmailModule (for password-reset emails, scope.md §32 point 7), leaving AuthAuditService inside
// AuthModule would have created a real cycle: AuthModule -> EmailModule -> VaultModule ->
// AuthModule (VaultModule only ever needed AuthModule for this one service).
@Module({
  providers: [AuthAuditEventsRepository, AuthAuditService],
  exports: [AuthAuditEventsRepository, AuthAuditService],
})
export class AuthAuditModule {}
