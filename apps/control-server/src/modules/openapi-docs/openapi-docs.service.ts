import { Injectable } from '@nestjs/common';
import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  changePasswordBodySchema,
  loginBodySchema,
  passwordResetBodySchema,
  passwordResetRequestBodySchema,
  signupBodySchema,
  tokenBodySchema,
} from '../auth/auth.controller';
import { statusQuerySchema } from '../user-directory/user-directory.controller';

// Must run once, before any .openapi() call below (scope.md §38 point 1) — extends zod's own
// ZodType prototype, so importing this service module (and nothing else) is what makes .openapi()
// available anywhere in the process.
extendZodWithOpenApi(z);

// Mirrors auth/auth-user.dto.ts's PublicUser exactly — kept as a separate OpenAPI-only schema
// (not imported) since that file exports a plain TS interface, not a zod schema, and this is the
// one response shape not already backed by a zod schema server-side.
const publicUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    status: z.enum(['active', 'disabled', 'invited']),
    emailVerified: z.boolean(),
    role: z.string(),
    userMetadata: z.record(z.unknown()),
    appMetadata: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    lastSignInAt: z.string().datetime().nullable(),
  })
  .openapi('User');

const sessionResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('bearer'),
    expiresIn: z.number().int(),
    user: publicUserSchema,
  })
  .openapi('Session');

// login.service.ts's issueSession() shape, minus the `user` field — refresh never re-fetches it.
const tokenResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    tokenType: z.literal('bearer'),
    expiresIn: z.number().int(),
  })
  .openapi('TokenRefresh');

// login.service.ts's two MFA short-circuit branches (scope.md §33 point 5b) — returned instead of
// a session when the project requires MFA and the user either has a factor already (mfaRequired)
// or has none yet (mfaEnrollmentRequired). Completed via /auth/v1/mfa/verify or
// /auth/v1/mfa/verify-enrollment, which are intentionally out of this spec's scope (§38) along
// with the rest of the MFA sub-flow's own endpoints.
const loginResponseSchema = z
  .union([
    sessionResponseSchema,
    z.object({ mfaRequired: z.literal(true), mfaToken: z.string() }).openapi('MfaChallenge'),
    z.object({ mfaEnrollmentRequired: z.literal(true), mfaToken: z.string() }).openapi('MfaEnrollmentChallenge'),
  ])
  .openapi('LoginResponse');

const directoryUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    status: z.enum(['active', 'disabled', 'invited']),
    createdAt: z.string().datetime(),
    lastSignInAt: z.string().datetime().nullable(),
  })
  .openapi('DirectoryUser');

const directoryResponseSchema = z
  .object({
    users: z.array(directoryUserSchema),
    total: z.number().int(),
  })
  .openapi('DirectoryResponse');

const storageObjectSchema = z
  .object({
    id: z.string().uuid(),
    path: z.string(),
    bucketName: z.string(),
    owner: z.string().nullable(),
    size: z.number().int(),
    contentType: z.string().nullable(),
    createdAt: z.string().datetime(),
  })
  .openapi('StorageObject');

@Injectable()
export class OpenapiDocsService {
  private cached: ReturnType<OpenApiGeneratorV3['generateDocument']> | null = null;

  // Built once and cached — unlike PostgREST's own catalog-driven spec, control-server's route
  // shapes are static for the life of the process, so there's no reload-on-DDL equivalent needed
  // here (scope.md §38 point 2).
  generate() {
    if (this.cached) return this.cached;

    const registry = new OpenAPIRegistry();

    registry.registerComponent('securitySchemes', 'apiKeyBearer', {
      type: 'http',
      scheme: 'bearer',
      description:
        'A publishable or secret API key JWT (minted from the admin console) — resolves which ' +
        'project the request targets. Required on every pre-login endpoint.',
    });
    registry.registerComponent('securitySchemes', 'accessTokenBearer', {
      type: 'http',
      scheme: 'bearer',
      description: "A signed-in user's own access token, returned by /auth/v1/login or /auth/v1/token.",
    });
    registry.registerComponent('securitySchemes', 'serviceRoleBearer', {
      type: 'http',
      scheme: 'bearer',
      description: 'A secret API key JWT whose role is service_role (or service_role_<project slug>).',
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/v1/signup',
      tags: ['auth'],
      summary: 'Register a new user',
      security: [{ apiKeyBearer: [] }],
      request: { body: { content: { 'application/json': { schema: signupBodySchema } } } },
      responses: {
        201: { description: 'User created', content: { 'application/json': { schema: publicUserSchema } } },
        422: { description: 'Email already registered' },
      },
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/v1/login',
      tags: ['auth'],
      summary: 'Sign in with email and password',
      security: [{ apiKeyBearer: [] }],
      request: { body: { content: { 'application/json': { schema: loginBodySchema } } } },
      responses: {
        200: {
          description: 'Session issued, or an MFA challenge if the project requires it',
          content: { 'application/json': { schema: loginResponseSchema } },
        },
        401: { description: 'Invalid email or password' },
      },
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/v1/token',
      tags: ['auth'],
      summary: 'Exchange a refresh token for a new access token',
      security: [{ apiKeyBearer: [] }],
      request: { body: { content: { 'application/json': { schema: tokenBodySchema } } } },
      responses: {
        200: { description: 'New token pair', content: { 'application/json': { schema: tokenResponseSchema } } },
        401: { description: 'Refresh token invalid, expired, or already used' },
      },
    });

    registry.registerPath({
      method: 'get',
      path: '/auth/v1/user',
      tags: ['auth'],
      summary: 'Get the current signed-in user',
      security: [{ accessTokenBearer: [] }],
      responses: {
        200: { description: 'The current user', content: { 'application/json': { schema: publicUserSchema } } },
        401: { description: 'Access token missing, invalid, or expired' },
      },
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/v1/user/password',
      tags: ['auth'],
      summary: "Change the current user's password",
      security: [{ accessTokenBearer: [] }],
      request: { body: { content: { 'application/json': { schema: changePasswordBodySchema } } } },
      responses: {
        204: { description: 'Password changed' },
        401: { description: 'Access token missing/invalid, or currentPassword incorrect' },
      },
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/v1/logout',
      tags: ['auth'],
      summary: "Revoke the current session's refresh token family",
      security: [{ accessTokenBearer: [] }],
      responses: {
        204: { description: 'Session revoked' },
        401: { description: 'Access token missing, invalid, or expired' },
      },
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/v1/password-reset/request',
      tags: ['auth'],
      summary: 'Request a password-reset email',
      description:
        'Always returns 204 regardless of whether the email exists or the project has outbound ' +
        'email configured, so this endpoint never reveals whether an address is registered.',
      security: [{ apiKeyBearer: [] }],
      request: { body: { content: { 'application/json': { schema: passwordResetRequestBodySchema } } } },
      responses: { 204: { description: 'Request accepted' } },
    });

    registry.registerPath({
      method: 'post',
      path: '/auth/v1/password-reset',
      tags: ['auth'],
      summary: 'Complete a password reset with a token',
      description:
        'Unauthenticated — the token itself (from an admin-generated reset link or a ' +
        'password-reset-request email) is the credential.',
      request: { body: { content: { 'application/json': { schema: passwordResetBodySchema } } } },
      responses: {
        204: { description: 'Password reset' },
        400: { description: 'Token invalid, expired, or already used' },
      },
    });

    registry.registerPath({
      method: 'get',
      path: '/users/v1/directory',
      tags: ['users'],
      summary: "Read the caller's own project's user directory",
      description:
        'Scoped entirely by the caller\'s own service_role key — project_id is never accepted as ' +
        'a request parameter (scope.md §36).',
      security: [{ serviceRoleBearer: [] }],
      request: {
        query: z.object({
          search: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(200).optional(),
          offset: z.coerce.number().int().min(0).optional(),
          status: statusQuerySchema,
        }),
      },
      responses: {
        200: {
          description: "The caller's project's users",
          content: { 'application/json': { schema: directoryResponseSchema } },
        },
        401: { description: 'Missing, invalid, non-service_role, or revoked API key' },
      },
    });

    const bucketPathParams = z.object({
      bucket: z.string().openapi({ description: 'Bucket name' }),
      path: z.string().openapi({ description: 'Object path within the bucket' }),
    });

    registry.registerPath({
      method: 'post',
      path: '/storage/v1/object/{bucket}/{path}',
      tags: ['storage'],
      summary: 'Upload an object',
      security: [{ accessTokenBearer: [] }, { serviceRoleBearer: [] }],
      request: {
        params: bucketPathParams,
        body: {
          content: {
            'multipart/form-data': {
              schema: z.object({
                file: z.string().openapi({ type: 'string', format: 'binary', description: 'File contents' }),
              }),
            },
          },
        },
      },
      responses: {
        200: { description: 'Object stored', content: { 'application/json': { schema: storageObjectSchema } } },
        401: { description: 'Access token/API key missing or invalid' },
        403: { description: "Not the object's owner, and not a private-bucket-bypassing service_role caller" },
      },
    });

    registry.registerPath({
      method: 'get',
      path: '/storage/v1/object/{bucket}/{path}',
      tags: ['storage'],
      summary: 'Download an object',
      security: [{ accessTokenBearer: [] }, { serviceRoleBearer: [] }],
      request: { params: bucketPathParams },
      responses: {
        200: { description: 'Object bytes', content: { 'application/octet-stream': { schema: z.string() } } },
        401: { description: 'Access token/API key missing or invalid' },
        404: { description: 'Object not found, or (private bucket) not visible to this caller' },
      },
    });

    registry.registerPath({
      method: 'delete',
      path: '/storage/v1/object/{bucket}/{path}',
      tags: ['storage'],
      summary: 'Delete an object',
      security: [{ accessTokenBearer: [] }, { serviceRoleBearer: [] }],
      request: { params: bucketPathParams },
      responses: {
        200: { description: 'Deleted', content: { 'application/json': { schema: z.object({ deleted: z.literal(true) }) } } },
        401: { description: 'Access token/API key missing or invalid' },
        403: { description: "Not the object's owner, and not a private-bucket-bypassing service_role caller" },
      },
    });

    const generator = new OpenApiGeneratorV3(registry.definitions);
    this.cached = generator.generateDocument({
      openapi: '3.0.0',
      info: {
        title: 'personal-baas Platform API',
        version: '1.0.0',
        description:
          'The public integration surface hand-built into control-server — auth, the ' +
          'service-role user directory, and object storage. This does NOT cover /rest/v1/* ' +
          '(the per-project Data API), which has its own PostgREST-generated spec at ' +
          '/admin/v1/database/openapi?schema=<name> via the admin console\'s API Explorer, nor ' +
          '/admin/v1/* (the platform-operator console API, not meant for outside integrators). ' +
          '/functions/* (per-function request/response shapes are developer-defined, not a ' +
          'fixed schema) and /realtime/* (a WebSocket upgrade) are likewise not represented here.',
      },
    });
    return this.cached;
  }
}
