import { Controller, Get, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AdminPageAuthFilter } from '../admin-auth/admin-page-auth.filter';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';

@Controller('admin/pdf')
@UseGuards(AdminSessionGuard)
@UseFilters(AdminPageAuthFilter)
export class PdfPageController {
  @Get()
  page(@Req() req: RequestWithAdmin, @Res() res: Response): void {
    res.render('pdf', { email: req.admin?.email });
  }
}
