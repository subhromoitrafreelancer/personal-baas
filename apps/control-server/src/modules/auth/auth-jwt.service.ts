import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importPKCS8, importSPKI, jwtVerify, KeyLike, SignJWT } from 'jose';
import { EnvConfig } from '../../config/env.schema';
import { AppAccessTokenClaims } from './auth.types';

const ISSUER = 'personal-baas';
const AUDIENCE = 'authenticated';
const ALG = 'EdDSA';

@Injectable()
export class AuthJwtService implements OnModuleInit {
  private readonly logger = new Logger(AuthJwtService.name);
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private accessTokenTtlSeconds!: number;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const privatePem = Buffer.from(
      this.config.get('AUTH_JWT_PRIVATE_KEY_BASE64', { infer: true }),
      'base64',
    ).toString('utf8');
    const publicPem = Buffer.from(
      this.config.get('AUTH_JWT_PUBLIC_KEY_BASE64', { infer: true }),
      'base64',
    ).toString('utf8');

    this.privateKey = await importPKCS8(privatePem, ALG);
    this.publicKey = await importSPKI(publicPem, ALG);
    this.accessTokenTtlSeconds = this.config.get('AUTH_ACCESS_TOKEN_TTL_SECONDS', { infer: true });
    this.logger.log('Loaded application JWT signing keypair');
  }

  async signAccessToken(claims: AppAccessTokenClaims): Promise<string> {
    return new SignJWT({
      role: claims.role,
      email: claims.email,
      session_id: claims.sessionId,
    })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenTtlSeconds}s`)
      .sign(this.privateKey);
  }

  async verifyAccessToken(token: string): Promise<AppAccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.role !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.session_id !== 'string'
      ) {
        return null;
      }
      return { sub: payload.sub, role: payload.role, email: payload.email, sessionId: payload.session_id };
    } catch {
      return null;
    }
  }
}
