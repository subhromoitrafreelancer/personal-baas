import { generateKeyPair, exportPKCS8, exportSPKI, decodeJwt } from 'jose';
import { StorageAccessGuard } from '../src/modules/storage/storage-access.guard';
import { AuthJwtService } from '../src/modules/auth/auth-jwt.service';
import {
  WorkerGuard,
  WorkerController,
  credentialHash,
} from '../src/modules/worker-integrations/worker.controller';
import { WorkerService } from '../src/modules/worker-integrations/worker.service';
import { WorkerRepository } from '../src/modules/worker-integrations/worker.repository';

describe('worker integration compatibility', () => {
  it('keeps ordinary keys at ten years while worker API keys are short lived and verify through the existing API-key verifier', async () => {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA');
    const values: Record<string, unknown> = {
      AUTH_JWT_PRIVATE_KEY_BASE64: Buffer.from(await exportPKCS8(privateKey)).toString('base64'),
      AUTH_JWT_PUBLIC_KEY_BASE64: Buffer.from(await exportSPKI(publicKey)).toString('base64'),
      AUTH_ACCESS_TOKEN_TTL_SECONDS: 900,
    };
    const jwt = new AuthJwtService({ get: (k: string) => values[k] } as any);
    await jwt.onModuleInit();
    const ordinary = await jwt.signApiKeyToken('service_role_a', 'key', 'a');
    const worker = await jwt.signWorkerApiKeyToken('service_role_a', 'key', 'a', 20);
    for (const [token, ttl] of [
      [ordinary, 315360000],
      [worker, 20],
    ] as const) {
      const claims = decodeJwt(token);
      expect(claims.exp! - claims.iat!).toBe(ttl);
      expect(await jwt.verifyApiKeyToken(token)).toEqual({
        role: 'service_role_a',
        kid: 'key',
        projectId: 'a',
      });
      expect(await jwt.verifyAccessToken(token)).toBeNull();
    }
    let revoked = false;
    const storage = new StorageAccessGuard(jwt, {
      findById: async () => ({ revoked_at: revoked ? new Date() : null }),
    } as any);
    const req: any = { headers: { authorization: `Bearer ${worker}` } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
    expect(await storage.canActivate(ctx)).toBe(true);
    expect(req.serviceKey).toEqual({ role: 'service_role_a', projectId: 'a' });
    revoked = true;
    await expect(storage.canActivate(ctx)).rejects.toThrow('revoked');
    const user = await jwt.signAccessToken({
      sub: 'u',
      email: 'u@example.invalid',
      sessionId: 's',
      projectId: 'a',
      role: 'authenticated_a',
    });
    const userClaims = decodeJwt(user);
    expect(userClaims.exp! - userClaims.iat!).toBe(900);
    expect((await jwt.verifyAccessToken(user))?.projectId).toBe('a');
    await expect(jwt.signWorkerApiKeyToken('r', 'k', 'p', 0)).rejects.toThrow();
  });
  it('disables machine routes by default; authenticates only hashed high-entropy credentials', async () => {
    const repo = { authenticate: jest.fn().mockResolvedValue('integration') };
    let enabled = false;
    const guard = new WorkerGuard(repo as any, { get: () => enabled } as any);
    const req: any = { headers: { authorization: `Bearer ${'a'.repeat(43)}` } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
    await expect(guard.canActivate(ctx)).rejects.toThrow();
    expect(repo.authenticate).not.toHaveBeenCalled();
    enabled = true;
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(repo.authenticate).toHaveBeenCalledWith(credentialHash('a'.repeat(43)));
    expect(req.workerIntegration).toBe('integration');
    req.headers.authorization = 'Bearer short';
    await expect(guard.canActivate(ctx)).rejects.toThrow();
  });
  it('rejects project/schema overrides in a secret request', async () => {
    const service = { resolve: jest.fn() };
    const ctrl = new WorkerController({} as any, service as any);
    await expect(
      ctrl.resolve({ workerIntegration: 'i' } as any, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', {
        name: 'STUDIO_PROVIDER_TOKEN',
        project_id: 'another-project',
      }),
    ).rejects.toThrow();
    expect(service.resolve).not.toHaveBeenCalled();
  });
  it('derives vault project from the authorized lease and enforces its secret-name allowlist', async () => {
    const grant = { id: 'g', project_id: 'canonical', allowed_secret_names: ['ALLOWED'] };
    const repo = { authorized: jest.fn((_i, _p, _l, op) => op({}, grant, {})) };
    const vault = { resolveForFunction: jest.fn().mockResolvedValue('dummy') };
    const audit = { record: jest.fn() };
    const service = new WorkerService(
      repo as any,
      {} as any,
      {} as any,
      vault as any,
      {} as any,
      audit as any,
    );
    await expect(service.resolve('integration', 'lease', 'DENIED')).rejects.toThrow();
    expect(vault.resolveForFunction).not.toHaveBeenCalled();
    expect(await service.resolve('integration', 'lease', 'ALLOWED')).toEqual({ value: 'dummy' });
    expect(vault.resolveForFunction).toHaveBeenCalledWith('canonical', 'ALLOWED');
    expect(audit.record).toHaveBeenCalledWith(null, 'worker.secret_read', null, null, {
      integrationId: 'integration',
      leaseId: 'lease',
      projectId: 'canonical',
      name: 'ALLOWED',
    });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('dummy');
  });
  it('rolls back and releases connection when a lease belongs to a different integration', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValue({ rowCount: 0 }),
      release: jest.fn(),
    };
    const repo = new WorkerRepository({ connect: async () => db } as any);
    const operation = jest.fn();
    await expect(repo.authorized('i', null, 'foreign-lease', operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith('ROLLBACK');
    expect(db.release).toHaveBeenCalled();
  });
});
