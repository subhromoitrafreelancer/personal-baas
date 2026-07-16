import type { Request } from 'express';
import type { ProjectRow } from '../projects/projects.repository';

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

// Populated by ApiKeyBearerGuard from the pre-login Authorization: Bearer <api-key-JWT>
// (scope.md §23 point 5) — the project signup/login/token operate against.
export interface RequestWithApiKeyProject extends Request {
  apiKeyProject?: ProjectRow;
}
