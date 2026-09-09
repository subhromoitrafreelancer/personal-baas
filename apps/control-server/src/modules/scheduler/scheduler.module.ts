import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { FunctionsModule } from '../functions/functions.module';
import { ProjectsModule } from '../projects/projects.module';
import { JobRunsRepository } from './job-runs.repository';
import { SchedulerAdminController } from './scheduler-admin.controller';
import { SchedulerPageController } from './scheduler-page.controller';
import { SchedulerTimerService } from './scheduler-timer.service';
import { SchedulerRepository } from './scheduler.repository';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [AdminAuthModule, AuthModule, ProjectsModule, FunctionsModule],
  controllers: [SchedulerAdminController, SchedulerPageController],
  providers: [SchedulerRepository, JobRunsRepository, SchedulerTimerService, SchedulerService],
})
export class SchedulerModule {}
