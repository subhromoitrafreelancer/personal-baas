import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { FunctionInvocationsRepository } from './function-invocations.repository';
import { FunctionsAdminController } from './functions-admin.controller';
import { FunctionsInvokeController } from './functions-invoke.controller';
import { FunctionsPageController } from './functions-page.controller';
import { FunctionsRepository } from './functions.repository';
import { FunctionsService } from './functions.service';

@Module({
  imports: [AdminAuthModule, AuthModule, ProjectsModule],
  controllers: [FunctionsAdminController, FunctionsInvokeController, FunctionsPageController],
  providers: [FunctionsRepository, FunctionInvocationsRepository, FunctionsService],
})
export class FunctionsModule {}
