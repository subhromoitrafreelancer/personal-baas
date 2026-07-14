import type { Request } from 'express';

export interface AppAccessTokenClaims {
  sub: string;
  role: string;
  email: string;
  sessionId: string;
}

export interface RequestWithUser extends Request {
  user?: AppAccessTokenClaims;
}
