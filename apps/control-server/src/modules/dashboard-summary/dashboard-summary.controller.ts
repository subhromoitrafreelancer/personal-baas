import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { DashboardSummaryService } from './dashboard-summary.service';

@Controller('admin/v1/dashboard')
@UseGuards(AdminSessionGuard)
export class DashboardSummaryController {
  constructor(private readonly summary: DashboardSummaryService) {}

  @Get('summary')
  async summaryData() {
    return this.summary.getSummary();
  }
}
