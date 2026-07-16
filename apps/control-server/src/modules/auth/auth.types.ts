import type { Request } from 'express';

export interface AppAccessTokenClaims {
  sub: string;
  role: string;
  email: string;
  sessionId: string;
  projectId: string;
}

export interface RequestWithUser extends Request {
  user?: AppAccessTokenClaims;
}
