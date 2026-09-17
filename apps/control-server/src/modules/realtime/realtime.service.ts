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

    // Reserve the id synchronously — the very first thing this method does, before any `await` —
    // so a second `subscribe` for the same id arriving while this one is still validating (the
    // gateway dispatches each WS message as an independent, unserialized async task, so two
    // messages can genuinely be mid-flight at once) sees the reservation immediately instead of
    // racing the eventual registry write. JS's single-threaded, run-to-first-await execution
    // makes this check-and-reserve atomic: nothing else can run between the `.has()` check and
    // the `.set()` below.
    if (!this.byClient.has(client)) {
      this.byClient.set(client, new Map());
    }
    const clientSubscriptions = this.byClient.get(client)!;
    if (clientSubscriptions.has(id)) {
      return { ok: false, message: `Subscription id '${id}' is already in use` };
    }
    // Placeholder: reserves the id in byClient immediately. Deliberately NOT added to byTable yet
    // — dispatch() must never match a subscription whose schema/grant/filter haven't been
    // validated, so the placeholder stays invisible to fan-out until finalized below.
    const reserved: Subscription = { id, client, schema: '', table };
    clientSubscriptions.set(id, reserved);

    if (!IDENTIFIER_RE.test(table)) {
      return this.releaseReservation(client, id, `Invalid table name '${table}'`);
    }

    let filterColumn: string | undefined;
    let filterValue: string | undefined;
    if (message.filter !== undefined) {
      const match = FILTER_RE.exec(message.filter);
      if (!match) {
        return this.releaseReservation(
          client,
          id,
          "Invalid filter (expected '<column>=eq.<value>')",
        );
      }
      [, filterColumn, filterValue] = match;
    }

    let schema: string;
    try {
      const project = await this.projects.getById(client.claims.projectId);
      schema = project.schema_name;
    } catch (err) {
      this.logger.error(`Failed to resolve project for subscribe: ${(err as Error).message}`);
      return this.releaseReservation(client, id, 'Could not resolve your project');
    }

    // A single misbehaving query here must never take down the whole gateway process (every
    // other connected client's connection along with it) — caught and reported as a normal
    // subscribe failure instead of propagating.
    try {
      // Independent queries — run concurrently rather than paying two sequential round-trips.
      // (Trades away the old sequential order's fail-fast property — skipping columnExists
      // entirely once hasGrant is known to fail — for lower latency on every filtered subscribe;
      // both are cheap catalog lookups and this isn't the dispatch() hot path, so the occasional
      // wasted columnExists call when the grant check was always going to fail is worth it.)
      const [hasGrant, columnOk] = await Promise.all([
        this.hasSelectGrant(client.claims.role, schema, table),
        filterColumn ? this.columnExists(schema, table, filterColumn) : Promise.resolve(true),
      ]);

      if (!hasGrant) {
        return this.releaseReservation(
          client,
          id,
          `Role '${client.claims.role}' does not have SELECT on '${schema}.${table}'`,
        );
      }

      if (filterColumn && !columnOk) {
        return this.releaseReservation(
          client,
          id,
          `Unknown column '${filterColumn}' on '${schema}.${table}'`,
        );
      }
    } catch (err) {
      this.logger.error(`Subscribe authorization query failed: ${(err as Error).message}`);
      return this.releaseReservation(client, id, 'Could not verify table access');
    }

    // The reservation can have been cancelled out from under us while the checks above were
    // awaiting — an 'unsubscribe' for this same id, or the client disconnecting entirely
    // (removeClient), both run synchronously and don't know a validation is in flight. Finalizing
    // anyway would resurrect a subscription the client already cancelled: live in byTable
    // (receiving events forever) but unreachable via byClient (so a later 'unsubscribe' would
    // report "unknown subscription id"). Identity check (not just existence) — a different
    // subscribe for the same id could have taken the slot by now.
    if (this.byClient.get(client)?.get(id) !== reserved) {
      return { ok: false, message: `Subscription id '${id}' was cancelled before it could be confirmed` };
    }

    reserved.schema = schema;
    reserved.filterColumn = filterColumn;
    reserved.filterValue = filterValue;
    this.addToByTable(reserved);
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

    // table/operation/record are identical for every subscriber matched above — they all share
    // this one NOTIFY event — so stringify each exactly once instead of redoing it per subscriber
    // inside the loop (this is the hottest path in the module: it runs on every INSERT/UPDATE/
    // DELETE for any subscribed table, potentially fanning out to many open connections). Only
    // `id` varies per subscriber, so only it needs its own (cheap, short) JSON.stringify call.
    const tableJson = JSON.stringify(payload.table);
    const operationJson = JSON.stringify(payload.operation);
    const recordJson = JSON.stringify(payload.record);

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

      const send = (): void => {
        subscription.client.send(
          `{"type":"event","id":${JSON.stringify(subscription.id)},"table":${tableJson},"operation":${operationJson},"record":${recordJson}}`,
        );
      };

      // Security remediation (Phase 25, scope.md §39): the table-level has_table_privilege check
      // in subscribe() is a one-time, shared-role grant check — it says nothing about whether
      // THIS subscriber's own row-level security policies would let them see THIS particular row.
      // For INSERT/UPDATE the changed row still exists, so it's re-verified live, under the
      // subscriber's own role + JWT claims, exactly as PostgREST would evaluate a direct SELECT.
      // DELETE is excluded on purpose: by dispatch time the row is already gone, so there's
      // nothing left to re-query against — a disclosed residual gap (scope.md §39), not an
      // oversight. Subscribers who need DELETE events restricted to their own rows should narrow
      // with an explicit filterColumn/filterValue, same as before this fix.
      if (payload.operation === 'DELETE') {
        send();
        continue;
      }

      this.isVisibleToSubscriber(subscription, payload.record)
        .then((visible) => {
          if (visible && subscription.client.readyState === WebSocket.OPEN) {
            send();
          }
        })
        .catch((err) => {
          this.logger.error(
            `RLS re-check threw for subscription '${subscription.id}': ${(err as Error).message}`,
          );
        });
    }
  }

  // Re-runs the row-visibility check a direct PostgREST SELECT would perform for this specific
  // subscriber, by opening a short transaction under their own project role and JWT claims and
  // asking Postgres itself (RLS included) whether the exact changed row is visible to it. Always
  // rolled back — this never writes, and never reuses a session across subscribers/events.
  private async isVisibleToSubscriber(
    subscription: Subscription,
    record: Record<string, unknown>,
  ): Promise<boolean> {
    const role = subscription.client.claims.role;
    // Server-issued JWT content, not attacker-supplied per request, but SET ROLE can't bind this
    // as a query parameter — the identifier check is defense-in-depth against a malformed claim
    // ever reaching raw SQL text.
    if (!IDENTIFIER_RE.test(role)) {
      this.logger.error(`Refusing RLS re-check for non-identifier role '${role}'`);
      return false;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE "${role}"`);
      // Same convention PostgREST itself uses so RLS policies built on the auth.uid() helper
      // (auth.uid() reads request.jwt.claims ->> 'sub') see exactly what they'd see for a real
      // request from this subscriber.
      await client.query('SELECT set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify(subscription.client.claims),
      ]);
      const { rows } = await client.query<{ visible: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM "${subscription.schema}"."${subscription.table}" t
           WHERE to_jsonb(t) = $1::jsonb
         ) AS visible`,
        [JSON.stringify(record)],
      );
      return rows[0]?.visible ?? false;
    } catch (err) {
      this.logger.error(
        `RLS re-check query failed for '${subscription.schema}.${subscription.table}': ${(err as Error).message}`,
      );
      // Fail closed: a broken check must never leak a row, only under-deliver one.
      return false;
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
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

  private releaseReservation(
    client: RealtimeClient,
    id: string,
    message: string,
  ): SubscriptionResult {
    this.byClient.get(client)?.delete(id);
    return { ok: false, message };
  }

  private addToByTable(subscription: Subscription): void {
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
