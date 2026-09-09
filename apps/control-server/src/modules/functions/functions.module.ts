import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { VaultModule } from '../vault/vault.module';
import { FunctionInvocationsRepository } from './function-invocations.repository';
import { FunctionsAdminController } from './functions-admin.controller';
import { FunctionsInvokeController } from './functions-invoke.controller';
import { FunctionsPageController } from './functions-page.controller';
import { FunctionsRepository } from './functions.repository';
import { FunctionsService } from './functions.service';

@Module({
  imports: [AdminAuthModule, AuthModule, ProjectsModule, VaultModule],
  controllers: [FunctionsAdminController, FunctionsInvokeController, FunctionsPageController],
  providers: [FunctionsRepository, FunctionInvocationsRepository, FunctionsService],
  // Consumed by SchedulerModule (Phase 13): a scheduled job's unit of work is a function
  // invocation via this exact FunctionsService.invoke() path, and the timer needs to resolve
  // the target function row itself before building InvokeParams.
  exports: [FunctionsRepository, FunctionsService],
})
export class FunctionsModule {}
