import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SqlConsoleController } from './sql-console.controller';
import { SqlConsoleService } from './sql-console.service';

@Module({
  imports: [AdminAuthModule],
  controllers: [SqlConsoleController],
  providers: [SqlConsoleService],
})
export class SqlConsoleModule {}
