import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { minioClientProvider } from './minio-client.provider';
import { StorageAdminController } from './storage-admin.controller';
import { StorageBucketsRepository } from './storage-buckets.repository';
import { StorageObjectController } from './storage-object.controller';
import { StorageObjectsRepository } from './storage-objects.repository';
import { StoragePageController } from './storage-page.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [AdminAuthModule, AuthModule, ProjectsModule],
  controllers: [StorageObjectController, StorageAdminController, StoragePageController],
  providers: [minioClientProvider, StorageBucketsRepository, StorageObjectsRepository, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
