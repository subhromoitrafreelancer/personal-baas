import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { DbExplorerController } from './db-explorer.controller';
import { DbExplorerPageController } from './db-explorer-page.controller';
import { DbExplorerService } from './db-explorer.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [DbExplorerController, DbExplorerPageController],
  providers: [DbExplorerService],
})
export class DbExplorerModule {}
