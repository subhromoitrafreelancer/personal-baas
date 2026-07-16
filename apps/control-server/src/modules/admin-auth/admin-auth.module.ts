import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  imports: [ProjectsModule],
  controllers: [AdminAuthController, AdminDashboardController],
  providers: [AdminAuthService, AdminSessionGuard],
  exports: [AdminAuthService, AdminSessionGuard],
})
export class AdminAuthModule {}
