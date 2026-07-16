import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdminProjectsController } from './admin-projects.controller';
import { AdminProjectsPageController } from './admin-projects-page.controller';

// Separate from ProjectsModule (the domain module — repository/service/postgrest-config) to
// avoid a circular import: AdminAuthModule already imports ProjectsModule (for
// ensureDefaultProject() at boot), so ProjectsModule importing AdminAuthModule back for
// AdminSessionGuard would cycle. Mirrors the existing admin-users/auth and api-keys/auth split.
@Module({
  imports: [AdminAuthModule, ProjectsModule],
  controllers: [AdminProjectsController, AdminProjectsPageController],
})
export class AdminProjectsModule {}
