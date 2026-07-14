import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Pool } from 'pg';
import { EnvConfig } from '../../config/env.schema';
import { ADMIN_QUERY_POOL } from './admin-db.constants';
import { AdminQueryService } from './admin-query.service';

@Global()
@Module({
  providers: [
    {
      provide: ADMIN_QUERY_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) =>
        new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
          max: config.get('ADMIN_SQL_POOL_MAX', { infer: true }),
        }),
    },
    AdminQueryService,
  ],
  exports: [AdminQueryService],
})
export class AdminDbModule implements OnModuleDestroy {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleDestroy() {
    const pool = this.moduleRef.get<Pool>(ADMIN_QUERY_POOL, { strict: false });
    await pool?.end();
  }
}
