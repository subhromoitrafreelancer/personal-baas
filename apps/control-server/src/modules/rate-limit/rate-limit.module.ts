import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { EnvConfig } from '../../config/env.schema';
import { AppThrottlerGuard } from './app-throttler.guard';

// Global request-rate limiting (Phase 17, scope.md §31). In-memory store (the package default),
// correct only for a single-instance deployment — same caveat already accepted for Realtime
// (§22) and Scheduler (§27). Deliberately does not front PostgREST's own /rest/v1/* — see §31
// point 6 for why that's an explicit scope boundary, not an oversight.
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get('RATE_LIMIT_GLOBAL_WINDOW_MS', { infer: true }),
            limit: config.get('RATE_LIMIT_GLOBAL_MAX', { infer: true }),
          },
        ],
      }),
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class RateLimitModule {}
