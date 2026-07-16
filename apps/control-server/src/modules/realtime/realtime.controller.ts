import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

@Controller('admin/v1/realtime')
@UseGuards(AdminSessionGuard)
export class RealtimeController {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly realtime: RealtimeService,
  ) {}

  @Get('stats')
  stats() {
    return {
      activeConnections: this.gateway.getActiveConnectionCount(),
      activeSubscriptions: this.realtime.getActiveSubscriptionCount(),
    };
  }
}
