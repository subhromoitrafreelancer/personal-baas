import { Module } from '@nestjs/common';
import { ProjectsRepository } from './projects.repository';
import { ProjectsService } from './projects.service';

@Module({
  providers: [ProjectsRepository, ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
