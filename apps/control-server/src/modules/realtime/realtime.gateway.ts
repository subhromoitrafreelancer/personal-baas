import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { RawData, WebSocket } from 'ws';
import { AuthJwtService } from '../auth/auth-jwt.service';
import { RealtimeService } from './realtime.service';
import { incomingRealtimeMessageSchema, RealtimeClient } from './realtime.types';

// Browsers' native WebSocket API can't set an Authorization header, so the access token travels
// as a query param instead (wss://.../realtime/v1?access_token=<JWT>) — the standard workaround
// for browser-native WS auth. Verified with the same AuthJwtService.verifyAccessToken
// AccessTokenGuard uses for HTTP requests; there's no Express request/guard chain to reuse here,
// only the raw upgrade IncomingMessage @nestjs/platform-ws hands to handleConnection.
const ACCESS_TOKEN_REQUIRED_CLOSE_CODE = 4401;

// Connection lifecycle/auth (item 2), subscribe/unsubscribe protocol + authorization (item 3),
// and delivery of RealtimeService.dispatch()'s NOTIFY fan-out (item 4) all flow through here —
// this gateway is the WebSocket-facing half of all three.
@WebSocketGateway({ path: '/realtime/v1' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly clients = new Set<RealtimeClient>();

  constructor(
    private readonly jwt: AuthJwtService,
    private readonly realtime: RealtimeService,
  ) {}

  async handleConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    // Attach a buffering listener synchronously — the very first thing this method does, before
    // the auth check's `await` below. verifyAccessToken is genuine async work (EdDSA verification
    // on Node's threadpool), and the underlying socket is already able to receive frames the
    // instant handleConnection starts running — ws does not buffer 'message' events for listeners
    // that don't exist yet, so a client that sends its first message immediately after seeing the
    // connection open (a common, reasonable pattern) would otherwise have it silently dropped.
    const buffered: RawData[] = [];
    const bufferMessage = (data: RawData) => {
      buffered.push(data);
    };
    client.on('message', bufferMessage);

    const token = new URL(request.url ?? '', 'ws://localhost').searchParams.get('access_token');
    const claims = token ? await this.jwt.verifyAccessToken(token) : null;
    if (!claims) {
      client.off('message', bufferMessage);
      client.close(ACCESS_TOKEN_REQUIRED_CLOSE_CODE, 'Access token required');
      return;
    }

    const authenticated = client as RealtimeClient;
    authenticated.claims = claims;
    this.clients.add(authenticated);
    this.logger.log(`Realtime client connected: user=${claims.sub} project=${claims.projectId}`);
    this.send(authenticated, { type: 'connected' });

    // Swap the buffering listener for the real handler, then replay anything that arrived during
    // the auth window, in the order it arrived.
    authenticated.off('message', bufferMessage);
    authenticated.on('message', (data) => {
      void this.handleMessage(authenticated, data);
    });
    for (const data of buffered) {
      void this.handleMessage(authenticated, data);
    }
  }

  handleDisconnect(client: RealtimeClient): void {
    this.clients.delete(client);
    this.realtime.removeClient(client);
    this.logger.log(`Realtime client disconnected: user=${client.claims?.sub ?? 'unknown'}`);
  }

  // For the Phase 8.5 dashboard KPI card — this process's own connections only. Postgres NOTIFY
  // fans out to every LISTEN-ing connection independently, so a multi-replica control-server
  // would still deliver events correctly; this count would just be per-replica, not global — a
  // known limitation of the count itself, not the delivery mechanism, and irrelevant to today's
  // single-instance deployment.
  getActiveConnectionCount(): number {
    return this.clients.size;
  }

  private async handleMessage(client: RealtimeClient, data: RawData): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      this.sendError(client, null, 'Invalid JSON message');
      return;
    }

    const result = incomingRealtimeMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.sendError(client, null, 'Invalid message shape');
      return;
    }

    const message = result.data;
    // Last line of defense: RealtimeService.subscribe already catches its own DB errors, but one
    // client's message must never be able to crash the process (and every other connection with
    // it) via some future/unanticipated throw path.
    try {
      if (message.type === 'subscribe') {
        const outcome = await this.realtime.subscribe(client, message);
        if (outcome.ok) {
          this.send(client, { type: 'subscribed', id: message.id });
        } else {
          this.sendError(client, message.id, outcome.message);
        }
        return;
      }

      const outcome = this.realtime.unsubscribe(client, message);
      if (outcome.ok) {
        this.send(client, { type: 'unsubscribed', id: message.id });
      } else {
        this.sendError(client, message.id, outcome.message);
      }
    } catch (err) {
      this.logger.error(`Unhandled error processing realtime message: ${(err as Error).message}`);
      this.sendError(client, message.id, 'Internal error');
    }
  }

  private send(client: RealtimeClient, payload: Record<string, unknown>): void {
    client.send(JSON.stringify(payload));
  }

  private sendError(client: RealtimeClient, id: string | null, message: string): void {
    this.send(client, { type: 'error', id, message });
  }
}
