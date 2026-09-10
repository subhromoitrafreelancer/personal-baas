import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ApiKeysRepository } from '../api-keys/api-keys.repository';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { minioClientProvider } from './minio-client.provider';
import { StorageAccessGuard } from './storage-access.guard';
import { StorageAdminController } from './storage-admin.controller';
import { StorageBucketsRepository } from './storage-buckets.repository';
import { StorageObjectController } from './storage-object.controller';
import { StorageObjectsRepository } from './storage-objects.repository';
import { StoragePageController } from './storage-page.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [AdminAuthModule, AuthModule, ProjectsModule],
  controllers: [StorageObjectController, StorageAdminController, StoragePageController],
  providers: [
    minioClientProvider,
    StorageBucketsRepository,
    StorageObjectsRepository,
    StorageService,
    // Separate instance from ApiKeysModule's own (see auth/api-key-bearer.guard.ts's identical
    // comment) — avoids importing the whole ApiKeysModule for one repository method;
    // ApiKeysRepository has no dependencies beyond the global PG_POOL, so this is harmless.
    ApiKeysRepository,
    StorageAccessGuard,
  ],
  exports: [StorageService],
})
export class StorageModule {}
