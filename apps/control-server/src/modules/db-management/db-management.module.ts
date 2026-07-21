import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { DbManagementController } from './db-management.controller';
import { DbManagementService } from './db-management.service';

@Module({
  imports: [AdminAuthModule, AuthModule],
  controllers: [DbManagementController],
  providers: [DbManagementService],
})
export class DbManagementModule {}
