import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { minioClientProvider } from '../storage/minio-client.provider';
import { HostingAdminController } from './hosting-admin.controller';
import { HostingPageController } from './hosting-page.controller';
import { HostingServeController } from './hosting-serve.controller';
import { HostingSiteFilesRepository } from './hosting-site-files.repository';
import { HostingSitesRepository } from './hosting-sites.repository';
import { HostingService } from './hosting.service';

@Module({
  imports: [AdminAuthModule, ProjectsModule],
  controllers: [HostingAdminController, HostingServeController, HostingPageController],
  providers: [minioClientProvider, HostingSitesRepository, HostingSiteFilesRepository, HostingService],
})
export class HostingModule {}
