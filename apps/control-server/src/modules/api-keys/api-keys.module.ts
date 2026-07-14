import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysPageController } from './api-keys-page.controller';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

@Module({
  imports: [AdminAuthModule, AuthModule],
  controllers: [ApiKeysController, ApiKeysPageController],
  providers: [ApiKeysRepository, ApiKeysService],
})
export class ApiKeysModule {}
