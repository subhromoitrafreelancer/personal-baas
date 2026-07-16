import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { RealtimeListenerService } from './realtime-listener.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Module({
  // DatabaseModule (PG_POOL) isn't imported explicitly — it's @Global(), same convention
  // ProjectsRepository already relies on. RealtimeListenerService opens its own dedicated
  // pg.Client rather than using PG_POOL (see its own file comment for why). AdminAuthModule is
  // for RealtimeController's AdminSessionGuard (Phase 8.5's stats endpoint).
  imports: [AuthModule, ProjectsModule, AdminAuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeGateway, RealtimeService, RealtimeListenerService],
  exports: [RealtimeGateway, RealtimeService],
})
export class RealtimeModule {}
