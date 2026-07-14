import { Controller, Get, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AdminPageAuthFilter } from '../admin-auth/admin-page-auth.filter';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';

@Controller('admin/audit')
@UseGuards(AdminSessionGuard)
@UseFilters(AdminPageAuthFilter)
export class AuditPageController {
  @Get()
  page(@Req() req: RequestWithAdmin, @Res() res: Response): void {
    res.render('audit', { email: req.admin?.email });
  }
}
