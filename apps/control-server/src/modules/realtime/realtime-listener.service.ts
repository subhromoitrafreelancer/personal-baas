import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { EnvConfig } from '../../config/env.schema';
import { RealtimeService } from './realtime.service';
import { NotifyPayload } from './realtime.types';

const CHANNEL = 'realtime_changes';
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

// A dedicated pg.Client, not PG_POOL/ADMIN_QUERY_POOL — a long-lived LISTEN session must never
// be handed back to a pool for reuse the way those pools' short-lived query connections are, so
// this owns its own connection lifecycle (including reconnect-with-backoff, a concern the pools
// don't have since pg-pool itself replaces a dropped client transparently). Not @Global(): unlike
// PG_POOL, nothing outside the realtime module needs this connection.
@Injectable()
export class RealtimeListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeListenerService.name);
  private client: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private stopped = false;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly realtime: RealtimeService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.client?.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    const client = new Client({
      connectionString: this.config.get('DATABASE_URL', { infer: true }),
    });

    client.on('error', (err) => {
      this.logger.error(`Realtime LISTEN connection error: ${err.message}`);
    });
    // pg emits 'end' after any disconnection, including ones preceded by 'error' — reconnecting
    // only from here (not also from 'error') avoids scheduling two reconnect attempts for one drop.
    client.on('end', () => {
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      client.on('notification', (message) => this.handleNotification(message.payload));
      this.client = client;
      this.backoffMs = INITIAL_BACKOFF_MS;
      this.logger.log(`Listening for realtime changes on '${CHANNEL}'`);
    } catch (err) {
      this.logger.error(
        `Failed to establish realtime LISTEN connection: ${(err as Error).message}`,
      );
      // client.connect() can succeed while the follow-up LISTEN query still fails (e.g. a
      // transient non-fatal Postgres error) — that failure mode does not itself close the
      // underlying session or emit 'error'/'end', so without this the connection would be
      // silently abandoned, still open, still counted against Postgres's max_connections, on
      // every such retry. Safe to call regardless of which step above failed (including a failed
      // client.connect() itself), same defensive pattern onModuleDestroy already uses.
      await client.end().catch(() => undefined);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private handleNotification(payload: string | undefined): void {
    if (!payload) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      this.logger.warn('Received unparseable realtime NOTIFY payload');
      return;
    }

    if (!isNotifyPayload(parsed)) {
      this.logger.warn('Received malformed realtime NOTIFY payload');
      return;
    }

    this.realtime.dispatch(parsed);
  }
}

function isNotifyPayload(value: unknown): value is NotifyPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.schema === 'string' &&
    typeof candidate.table === 'string' &&
    typeof candidate.operation === 'string' &&
    typeof candidate.record === 'object' &&
    candidate.record !== null
  );
}
