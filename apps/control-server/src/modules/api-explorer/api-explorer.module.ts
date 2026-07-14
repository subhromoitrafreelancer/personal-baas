import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ApiExplorerPageController } from './api-explorer-page.controller';

@Module({
  imports: [AdminAuthModule],
  controllers: [ApiExplorerPageController],
})
export class ApiExplorerModule {}
