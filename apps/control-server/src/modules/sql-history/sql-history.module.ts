import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SqlHistoryController } from './sql-history.controller';
import { SqlHistoryService } from './sql-history.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [SqlHistoryController],
  providers: [SqlHistoryService],
  exports: [SqlHistoryService],
})
export class SqlHistoryModule {}
