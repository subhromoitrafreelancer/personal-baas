import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { WebSocket } from 'ws';
import { PG_POOL } from '../database/database.module';
import { ProjectsService } from '../projects/projects.service';
import { COLUMN_EXISTS_QUERY, HAS_SELECT_GRANT_QUERY } from './realtime.queries';
import {
  NotifyPayload,
  RealtimeClient,
  SubscribeMessage,
  Subscription,
  UnsubscribeMessage,
} from './realtime.types';

// Plain Postgres identifiers only — table/column names are interpolated into format('%I.%I', ...)
// server-side (realtime.queries.ts) regardless, but rejecting anything else here up front means
// a typo/garbage table name gets a clear WS error instead of a raw Postgres one.
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
// PostgREST's own `eq` operator spelling (scope.md §15) — the only filter shape accepted, per
// the "coarse model, not per-event RLS re-evaluation" framing in realtime.types.ts.
const FILTER_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)=eq\.(.+)$/;

export type SubscriptionResult = { ok: true } | { ok: false; message: string };

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  // Keyed by `${schema}.${table}` — Phase 8.4's fan-out reads this directly to match an incoming
  // NOTIFY payload against subscribers, so the shape here isn't just this item's bookkeeping.
  private readonly byTable = new Map<string, Map<string, Subscription>>();
  private readonly byClient = new Map<RealtimeClient, Map<string, Subscription>>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly projects: ProjectsService,
  ) {}

  async subscribe(client: RealtimeClient, message: SubscribeMessage): Promise<SubscriptionResult> {
    const { id, table } = message;
    if (!id) {
      return { ok: false, message: 'Subscription id is required' };
    }
    if (this.byClient.get(client)?.has(id)) {
      return { ok: false, message: `Subscription id '${id}' is already in use` };
    }
    if (!IDENTIFIER_RE.test(table)) {
      return { ok: false, message: `Invalid table name '${table}'` };
    }

    let filterColumn: string | undefined;
    let filterValue: string | undefined;
    if (message.filter !== undefined) {
      const match = FILTER_RE.exec(message.filter);
      if (!match) {
        return { ok: false, message: "Invalid filter (expected '<column>=eq.<value>')" };
      }
      [, filterColumn, filterValue] = match;
    }

    let schema: string;
    try {
      const project = await this.projects.getById(client.claims.projectId);
      schema = project.schema_name;
    } catch (err) {
      this.logger.error(`Failed to resolve project for subscribe: ${(err as Error).message}`);
      return { ok: false, message: 'Could not resolve your project' };
    }

    // A single misbehaving query here must never take down the whole gateway process (every
    // other connected client's connection along with it) — caught and reported as a normal
    // subscribe failure instead of propagating.
    try {
      const hasGrant = await this.hasSelectGrant(client.claims.role, schema, table);
      if (!hasGrant) {
        return {
          ok: false,
          message: `Role '${client.claims.role}' does not have SELECT on '${schema}.${table}'`,
        };
      }

      if (filterColumn && !(await this.columnExists(schema, table, filterColumn))) {
        return { ok: false, message: `Unknown column '${filterColumn}' on '${schema}.${table}'` };
      }
    } catch (err) {
      this.logger.error(`Subscribe authorization query failed: ${(err as Error).message}`);
      return { ok: false, message: 'Could not verify table access' };
    }

    const subscription: Subscription = { id, client, schema, table, filterColumn, filterValue };
    this.addSubscription(subscription);
    return { ok: true };
  }

  unsubscribe(client: RealtimeClient, message: UnsubscribeMessage): SubscriptionResult {
    const subscription = this.byClient.get(client)?.get(message.id);
    if (!subscription) {
      return { ok: false, message: `Unknown subscription id '${message.id}'` };
    }
    this.removeSubscription(subscription);
    return { ok: true };
  }

  // Called by RealtimeListenerService for every parsed NOTIFY. Matching + delivery happens here
  // (not in the listener) so the subscription registry stays private to this service — no second
  // DB round-trip per event, just an in-process Map lookup plus an optional in-memory equality
  // check against each matching subscriber's filterColumn/filterValue.
  dispatch(payload: NotifyPayload): void {
    const subscriptions = this.byTable.get(`${payload.schema}.${payload.table}`);
    if (!subscriptions || subscriptions.size === 0) {
      return;
    }

    for (const subscription of subscriptions.values()) {
      if (subscription.filterColumn) {
        const value = payload.record[subscription.filterColumn];
        if (value === undefined || String(value) !== subscription.filterValue) {
          continue;
        }
      }
      if (subscription.client.readyState !== WebSocket.OPEN) {
        continue;
      }
      subscription.client.send(
        JSON.stringify({
          type: 'event',
          id: subscription.id,
          table: subscription.table,
          operation: payload.operation,
          record: payload.record,
        }),
      );
    }
  }

  removeClient(client: RealtimeClient): void {
    const subscriptions = this.byClient.get(client);
    if (!subscriptions) {
      return;
    }
    for (const subscription of subscriptions.values()) {
      this.byTable.get(this.tableKey(subscription))?.delete(subscription.id);
    }
    this.byClient.delete(client);
  }

  private addSubscription(subscription: Subscription): void {
    if (!this.byClient.has(subscription.client)) {
      this.byClient.set(subscription.client, new Map());
    }
    this.byClient.get(subscription.client)!.set(subscription.id, subscription);

    const key = this.tableKey(subscription);
    if (!this.byTable.has(key)) {
      this.byTable.set(key, new Map());
    }
    this.byTable.get(key)!.set(subscription.id, subscription);
  }

  private removeSubscription(subscription: Subscription): void {
    this.byClient.get(subscription.client)?.delete(subscription.id);
    this.byTable.get(this.tableKey(subscription))?.delete(subscription.id);
  }

  private tableKey(subscription: Pick<Subscription, 'schema' | 'table'>): string {
    return `${subscription.schema}.${subscription.table}`;
  }

  // For the Phase 8.5 dashboard KPI card — counts this process's own subscriptions only (see
  // RealtimeGateway.getActiveConnectionCount's equivalent caveat: correct for today's
  // single-instance deployment, a known limitation if the control-server is ever run as
  // multiple replicas, since each replica would only know about its own local subscribers).
  getActiveSubscriptionCount(): number {
    let count = 0;
    for (const subscriptions of this.byTable.values()) {
      count += subscriptions.size;
    }
    return count;
  }

  private async hasSelectGrant(role: string, schema: string, table: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ has_select: boolean }>(HAS_SELECT_GRANT_QUERY, [
      role,
      schema,
      table,
    ]);
    return rows[0]?.has_select ?? false;
  }

  private async columnExists(schema: string, table: string, column: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ column_exists: boolean }>(COLUMN_EXISTS_QUERY, [
      schema,
      table,
      column,
    ]);
    return rows[0]?.column_exists ?? false;
  }
}
