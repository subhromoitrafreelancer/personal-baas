import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { DbExplorerService } from './db-explorer.service';

@Controller('admin/v1/database')
@UseGuards(AdminSessionGuard)
export class DbExplorerController {
  constructor(private readonly dbExplorer: DbExplorerService) {}

  @Get('objects')
  async objects() {
    return this.dbExplorer.getDatabaseObjects();
  }

  @Get('openapi')
  async openapi(@Query('schema') schema?: string) {
    if (!schema) {
      throw new BadRequestException('schema query parameter is required');
    }
    return this.dbExplorer.getOpenapiSpec(schema);
  }
}
