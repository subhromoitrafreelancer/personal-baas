import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminUsersModule } from '../admin-users/admin-users.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { DbExplorerModule } from '../db-explorer/db-explorer.module';
import { ProjectsModule } from '../projects/projects.module';
import { StorageModule } from '../storage/storage.module';
import { DashboardSummaryController } from './dashboard-summary.controller';
import { DashboardSummaryService } from './dashboard-summary.service';

// A new module, not folded into admin-auth (which already owns the dashboard *page* controller)
// or any of the five modules it aggregates over — it needs all of their services at once, and
// none of those modules import each other, so importing all five here (rather than teaching one
// of them to import the others) avoids introducing any circular dependency.
@Module({
  imports: [AdminAuthModule, ProjectsModule, DbExplorerModule, AdminUsersModule, ApiKeysModule, StorageModule],
  controllers: [DashboardSummaryController],
  providers: [DashboardSummaryService],
})
export class DashboardSummaryModule {}
