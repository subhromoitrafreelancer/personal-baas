import { ProjectsRepository } from '../src/modules/projects/projects.repository';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { VaultRepository } from '../src/modules/vault/vault.repository';
import { VaultService } from '../src/modules/vault/vault.service';
import { WorkerRepository } from '../src/modules/worker-integrations/worker.repository';
import { WorkerService } from '../src/modules/worker-integrations/worker.service';

// The checked-out client represents the final available pool slot; a nested pool query
// fails immediately so the regression is deterministic rather than hanging the test runner.
describe('worker transaction connection reuse', () => {
  function fixture() {
    const project = { id: 'project', service_role_role: 'service_role_project', schema_name: 'api_project' };
    const statements: string[] = [];
    const db = {
      query: jest.fn(async (sql: string, args?: unknown[]) => {
        statements.push(sql);
        if (sql.includes('worker_integrations')) return { rowCount: 1, rows: [{ id: 'integration' }] };
        if (sql.includes('worker_project_grants')) return { rowCount: 1, rows: [{ id: 'grant', project_id: 'project', allowed_secret_names: ['ALLOWED'] }] };
        if (sql.includes('SELECT l.*')) return { rowCount: 1, rows: [{ id: 'lease', api_key_id: 'key' }] };
        if (sql.includes('INSERT INTO platform.api_keys')) return { rowCount: 1, rows: [{ id: 'key' }] };
        if (sql.includes('FROM platform.projects')) return { rows: [project] };
        if (sql.includes('FROM vault.secrets')) return { rows: [{ nonce: Buffer.from('nonce'), ciphertext: Buffer.from('ciphertext') }] };
        return { rowCount: 1, rows: [] };
      }),
      release: jest.fn(),
    };
    const pool = {
      connect: jest.fn(async () => db),
      query: jest.fn(async () => { throw new Error('Nested pool acquisition would deadlock'); }),
    };
    const audit = { record: jest.fn() };
    const projects = new ProjectsService(new ProjectsRepository(pool as any), {} as any);
    const crypto = { decrypt: jest.fn(() => 'test-secret') };
    const vault = new VaultService(new VaultRepository(pool as any), crypto as any, audit as any);
    const jwt = { signWorkerApiKeyToken: jest.fn(async () => 'header.' + Buffer.from(JSON.stringify({ exp: 2000000000 })).toString('base64url') + '.signature') };
    const worker = new WorkerService(new WorkerRepository(pool as any), jwt as any, projects, vault, { get: () => 300 } as any, audit as any);
    return { worker, pool, db, audit, crypto, statements };
  }
  it('creates and renews leases using the already checked-out client', async () => {
    for (const lease of [null, 'lease']) {
      const f = fixture();
      const result = await f.worker.lease('integration', lease ? null : 'project', lease);
      expect(result.project_id).toBe('project');
      expect(f.pool.query).not.toHaveBeenCalled();
      expect(f.statements.at(-1)).toBe('COMMIT');
      expect(f.db.release).toHaveBeenCalledTimes(1);
    }
  });
  it('resolves an allowed secret through the same authorized client', async () => {
    const f = fixture();
    await expect(f.worker.resolve('integration', 'lease', 'ALLOWED')).resolves.toEqual({ value: 'test-secret' });
    expect(f.pool.query).not.toHaveBeenCalled();
    expect(f.statements.at(-1)).toBe('COMMIT');
    expect(f.db.release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(f.audit.record.mock.calls)).not.toContain('test-secret');
  });
  it('keeps authorization and rollback intact for a denied secret', async () => {
    const f = fixture();
    await expect(f.worker.resolve('integration', 'lease', 'DENIED')).rejects.toThrow();
    expect(f.crypto.decrypt).not.toHaveBeenCalled();
    expect(f.statements.at(-1)).toBe('ROLLBACK');
    expect(f.db.release).toHaveBeenCalledTimes(1);
  });
  it('keeps ordinary project and vault lookups using the pool', async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await new ProjectsRepository(pool as any).findById('project');
    await new VaultRepository(pool as any).findByProjectAndName('project', 'ALLOWED');
    expect(pool.query).toHaveBeenCalledTimes(2);
  });
});
