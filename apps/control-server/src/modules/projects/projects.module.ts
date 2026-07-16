import { Module } from '@nestjs/common';
import { PostgrestConfigService } from './postgrest-config.service';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  providers: [ProjectsRepository, ProjectsService, PostgrestConfigService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
