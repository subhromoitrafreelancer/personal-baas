import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { VaultModule } from '../vault/vault.module';
import { WorkerAdminController, WorkerController, WorkerGuard } from './worker.controller';
import { WorkerPageController } from './worker-page.controller';
import { WorkerRepository } from './worker.repository';
import { WorkerService } from './worker.service';
@Module({
  imports: [AdminAuthModule, AuthModule, ProjectsModule, VaultModule],
  controllers: [WorkerController, WorkerAdminController, WorkerPageController],
  providers: [WorkerRepository, WorkerService, WorkerGuard],
})
export class WorkerModule {}
