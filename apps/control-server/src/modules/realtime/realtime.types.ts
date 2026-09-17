import { z } from 'zod';
import type { WebSocket } from 'ws';
import type { AppAccessTokenClaims } from '../auth/auth.types';

// The claims are attached to the raw `ws` client object in RealtimeGateway.handleConnection once
// the handshake's access_token query param verifies — there's no Express request to stash them
// on, unlike the HTTP-side RequestWithUser (auth.types.ts).
export interface RealtimeClient extends WebSocket {
  claims: AppAccessTokenClaims;
}

// Client -> server messages. Deliberately a flat { type, ... } envelope handled directly off the
// raw 'message' event (see RealtimeGateway) rather than @nestjs/websockets' @SubscribeMessage +
// default { event, data } parser — that parser exists for socket.io-style compatibility, which
// isn't a goal here (item 2 already picked the ws adapter specifically to avoid that overhead).
// Validated with zod, same convention as the HTTP side's request-body schemas (e.g.
// admin-auth.controller.ts's loginBodySchema).
export const subscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  id: z.string().min(1),
  table: z.string().min(1),
  // Restricted to a single `<column>=eq.<value>` shape, matching PostgREST's own `eq` operator
  // spelling (scope.md §15) — intentionally narrow, see Subscription's own comment for why.
  filter: z.string().min(1).optional(),
});
export type SubscribeMessage = z.infer<typeof subscribeMessageSchema>;

export const unsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  id: z.string().min(1),
});
export type UnsubscribeMessage = z.infer<typeof unsubscribeMessageSchema>;

export const incomingRealtimeMessageSchema = z.discriminatedUnion('type', [
  subscribeMessageSchema,
  unsubscribeMessageSchema,
]);
export type IncomingRealtimeMessage = z.infer<typeof incomingRealtimeMessageSchema>;

// A validated, active subscription: schema is always the caller's own resolved project schema
// (never client-supplied — there's exactly one valid schema per project, so accepting one from
// the client would only ever be useful for requesting someone else's). subscribe()'s
// has_table_privilege check is deliberately coarse (a one-time, shared-role grant check, not a
// per-row RLS re-evaluation) — it only proves the subscriber's role can SELECT the table at all.
// Per-row RLS is now re-verified at delivery time instead, in RealtimeService.dispatch() /
// isVisibleToSubscriber() (Phase 25 security remediation, scope.md §39), for INSERT/UPDATE only —
// DELETE still relies solely on this grant check plus filterColumn/filterValue, since the row is
// already gone by the time a NOTIFY reaches dispatch() and there's nothing left to re-query
// against. Subscribers who need DELETE events scoped to their own rows should still narrow with
// an explicit filter, e.g. `user_id=eq.<uuid>`, same as the Phase 7a todo-app's own RLS does.
export interface Subscription {
  id: string;
  client: RealtimeClient;
  schema: string;
  table: string;
  filterColumn?: string;
  filterValue?: string;
}

// Shape produced by platform.notify_realtime_change() (see the Phase 8.1 migration) and parsed
// off the 'realtime_changes' NOTIFY channel by RealtimeListenerService. `record` is `NEW` for
// INSERT/UPDATE and `OLD` for DELETE — decided in the trigger function itself, not here. zod,
// same convention as the client-message schemas above — the previous hand-rolled `typeof` type
// guard had no compiler-enforced link to this shape, so a future field addition here could
// silently drift out of sync with it.
export const notifyPayloadSchema = z.object({
  schema: z.string(),
  table: z.string(),
  operation: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  record: z.record(z.string(), z.unknown()),
});
export type NotifyPayload = z.infer<typeof notifyPayloadSchema>;
