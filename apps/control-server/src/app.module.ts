import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv, EnvConfig } from './config/env.schema';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminDbModule } from './modules/admin-db/admin-db.module';
import { DatabaseModule } from './modules/database/database.module';
import { DbExplorerModule } from './modules/db-explorer/db-explorer.module';
import { HealthModule } from './modules/health/health.module';
import { SqlConsoleModule } from './modules/sql-console/sql-console.module';
import { SqlHistoryModule } from './modules/sql-history/sql-history.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DatabaseModule,
    AdminDbModule,
    HealthModule,
    AdminAuthModule,
    SqlHistoryModule,
    SqlConsoleModule,
    DbExplorerModule,
  ],
})
export class AppModule {}
