import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { EnvConfig } from '../../config/env.schema';
import { PG_POOL } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    const databaseReachable = await this.checkDatabase();
    const postgrestReachable = await this.checkPostgrest();

    if (!databaseReachable || !postgrestReachable) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: databaseReachable ? 'reachable' : 'unreachable',
        postgrest: postgrestReachable ? 'reachable' : 'unreachable',
      });
    }

    return { status: 'ok', database: 'reachable', postgrest: 'reachable' };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // PostgREST's image ships no shell/HTTP client, so it can't run its own Docker HEALTHCHECK
  // (see docker-compose.yml comment) — this check, plus Caddy's own healthcheck hitting
  // /rest/v1/ through the real proxy path, are this project's only reachability signals for it.
  private async checkPostgrest(): Promise<boolean> {
    try {
      const response = await fetch(this.config.get('POSTGREST_URL', { infer: true }));
      return response.ok;
    } catch {
      return false;
    }
  }
}
