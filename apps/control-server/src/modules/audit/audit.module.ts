import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { AuditPageController } from './audit-page.controller';

@Module({
  imports: [AdminAuthModule, AuthModule],
  controllers: [AuditController, AuditPageController],
})
export class AuditModule {}
