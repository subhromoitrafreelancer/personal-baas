import type { WebSocket } from 'ws';
import type { AppAccessTokenClaims } from '../auth/auth.types';

// The claims are attached to the raw `ws` client object in RealtimeGateway.handleConnection once
// the handshake's access_token query param verifies — there's no Express request to stash them
// on, unlike the HTTP-side RequestWithUser (auth.types.ts).
export interface RealtimeClient extends WebSocket {
  claims: AppAccessTokenClaims;
}
