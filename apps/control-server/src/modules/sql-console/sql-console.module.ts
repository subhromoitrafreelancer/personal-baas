import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SqlHistoryModule } from '../sql-history/sql-history.module';
import { SqlConsoleController } from './sql-console.controller';
import { SqlConsoleService } from './sql-console.service';
import { SqlEditorPageController } from './sql-editor-page.controller';

@Module({
  imports: [AdminAuthModule, SqlHistoryModule],
  controllers: [SqlConsoleController, SqlEditorPageController],
  providers: [SqlConsoleService],
})
export class SqlConsoleModule {}
