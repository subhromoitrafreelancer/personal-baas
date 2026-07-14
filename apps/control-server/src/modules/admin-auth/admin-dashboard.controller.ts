import { Controller, Get, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AdminPageAuthFilter } from './admin-page-auth.filter';
import { AdminSessionGuard } from './admin-session.guard';
import { RequestWithAdmin } from './admin.types';

@Controller('admin')
@UseGuards(AdminSessionGuard)
@UseFilters(AdminPageAuthFilter)
export class AdminDashboardController {
  @Get()
  dashboard(@Req() req: RequestWithAdmin, @Res() res: Response): void {
    res.render('dashboard', { email: req.admin?.email });
  }
}
