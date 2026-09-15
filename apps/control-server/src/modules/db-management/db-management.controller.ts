import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../admin-auth/admin-session.guard';
import { RequestWithAdmin } from '../admin-auth/admin.types';
import { deleteTableBodySchema, updateCommentBodySchema } from './db-management.dto';
import { DbManagementService } from './db-management.service';

@Controller('admin/v1/database')
@UseGuards(AdminSessionGuard)
export class DbManagementController {
  constructor(private readonly dbManagement: DbManagementService) {}

  @Get(':schema/tables/:table/delete-preview')
  tableDeletePreview(@Param('schema') schema: string, @Param('table') table: string) {
    return this.dbManagement.getTableDeletePreview(schema, table);
  }

  @Delete(':schema/tables/:table')
  async deleteTable(
    @Param('schema') schema: string,
    @Param('table') table: string,
    @Body() body: unknown,
    @Req() req: RequestWithAdmin,
  ) {
    const parsed = deleteTableBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    await this.dbManagement.deleteTable(schema, table, parsed.data.confirmName, req.admin!);
    return { deleted: true };
  }

  @Get(':schema/tables/:table/columns/:column/delete-preview')
  columnDeletePreview(
    @Param('schema') schema: string,
    @Param('table') table: string,
    @Param('column') column: string,
  ) {
    return this.dbManagement.getColumnDeletePreview(schema, table, column);
  }

  @Delete(':schema/tables/:table/columns/:column')
  async deleteColumn(
    @Param('schema') schema: string,
    @Param('table') table: string,
    @Param('column') column: string,
    @Req() req: RequestWithAdmin,
  ) {
    await this.dbManagement.deleteColumn(schema, table, column, req.admin!);
    return { deleted: true };
  }

  @Get(':schema/functions/:oid/source')
  functionSource(@Param('schema') schema: string, @Param('oid') oid: string) {
    return this.dbManagement.getFunctionSource(schema, oid);
  }

  @Patch(':schema/tables/:table/comment')
  async updateTableComment(
    @Param('schema') schema: string,
    @Param('table') table: string,
    @Body() body: unknown,
    @Req() req: RequestWithAdmin,
  ) {
    const parsed = updateCommentBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    await this.dbManagement.updateTableComment(
      schema,
      table,
      parsed.data.summary,
      parsed.data.description,
      req.admin!,
    );
    return { updated: true };
  }

  @Patch(':schema/tables/:table/columns/:column/comment')
  async updateColumnComment(
    @Param('schema') schema: string,
    @Param('table') table: string,
    @Param('column') column: string,
    @Body() body: unknown,
    @Req() req: RequestWithAdmin,
  ) {
    const parsed = updateCommentBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    await this.dbManagement.updateColumnComment(
      schema,
      table,
      column,
      parsed.data.summary,
      parsed.data.description,
      req.admin!,
    );
    return { updated: true };
  }

  @Patch(':schema/functions/:oid/comment')
  async updateFunctionComment(
    @Param('schema') schema: string,
    @Param('oid') oid: string,
    @Body() body: unknown,
    @Req() req: RequestWithAdmin,
  ) {
    const parsed = updateCommentBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join('; '));
    }
    await this.dbManagement.updateFunctionComment(
      schema,
      oid,
      parsed.data.summary,
      parsed.data.description,
      req.admin!,
    );
    return { updated: true };
  }
}
