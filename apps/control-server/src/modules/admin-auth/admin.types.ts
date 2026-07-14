import type { Request } from 'express';

export interface AdminIdentity {
  sub: string;
  email: string;
}

export interface RequestWithAdmin extends Request {
  admin?: AdminIdentity;
}
