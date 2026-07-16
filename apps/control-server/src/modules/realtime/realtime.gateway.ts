import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import { AuthJwtService } from '../auth/auth-jwt.service';
import { RealtimeClient } from './realtime.types';

// Browsers' native WebSocket API can't set an Authorization header, so the access token travels
// as a query param instead (wss://.../realtime/v1?access_token=<JWT>) — the standard workaround
// for browser-native WS auth. Verified with the same AuthJwtService.verifyAccessToken
// AccessTokenGuard uses for HTTP requests; there's no Express request/guard chain to reuse here,
// only the raw upgrade IncomingMessage @nestjs/platform-ws hands to handleConnection.
const ACCESS_TOKEN_REQUIRED_CLOSE_CODE = 4401;

// Item 2 scope only: connection lifecycle + auth handshake. Subscribe/unsubscribe message
// handling (Phase 8.3) and NOTIFY fan-out (Phase 8.4) land in their own PRs on top of this.
@WebSocketGateway({ path: '/realtime/v1' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly clients = new Set<RealtimeClient>();

  constructor(private readonly jwt: AuthJwtService) {}

  async handleConnection(client: WebSocket, request: IncomingMessage): Promise<void> {
    const token = new URL(request.url ?? '', 'ws://localhost').searchParams.get('access_token');
    const claims = token ? await this.jwt.verifyAccessToken(token) : null;
    if (!claims) {
      client.close(ACCESS_TOKEN_REQUIRED_CLOSE_CODE, 'Access token required');
      return;
    }

    const authenticated = client as RealtimeClient;
    authenticated.claims = claims;
    this.clients.add(authenticated);
    this.logger.log(`Realtime client connected: user=${claims.sub} project=${claims.projectId}`);
    authenticated.send(JSON.stringify({ type: 'connected' }));
  }

  handleDisconnect(client: RealtimeClient): void {
    this.clients.delete(client);
    this.logger.log(`Realtime client disconnected: user=${client.claims?.sub ?? 'unknown'}`);
  }

  getActiveConnectionCount(): number {
    return this.clients.size;
  }
}
