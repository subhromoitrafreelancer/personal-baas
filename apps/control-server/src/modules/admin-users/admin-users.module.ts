import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersPageController } from './admin-users-page.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [AdminAuthModule, AuthModule, ProjectsModule],
  controllers: [AdminUsersController, AdminUsersPageController],
  providers: [AdminUsersService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
