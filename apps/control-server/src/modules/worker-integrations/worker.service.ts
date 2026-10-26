import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EnvConfig } from '../../config/env.schema';
import { AuthAuditService } from '../auth/auth-audit.service';
import { AuthJwtService } from '../auth/auth-jwt.service';
import { ProjectsService } from '../projects/projects.service';
import { VaultService } from '../vault/vault.service';
import { WorkerRepository } from './worker.repository';

@Injectable()
export class WorkerService {
  constructor(
    private readonly repo: WorkerRepository,
    private readonly jwt: AuthJwtService,
    private readonly projects: ProjectsService,
    private readonly vault: VaultService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly audit: AuthAuditService,
  ) {}
  async lease(integration: string, projectId: string | null, leaseId: string | null) {
    const result = await this.repo.authorized(
      integration,
      projectId,
      leaseId,
      async (db, grant, existing) => {
        // Reuse the locked transaction connection. Borrowing a second pool connection here
        // deadlocks when other worker requests occupy the pool waiting for this row lock.
        const project = await this.projects.getById(grant.project_id, db);
        const ttl = this.config.get('WORKER_LEASE_TTL_SECONDS', { infer: true });
        let key = existing?.api_key_id;
        if (!key) {
          const result = await db.query(
            `INSERT INTO platform.api_keys(name,kind,created_by,project_id)
          VALUES ($1,'secret','worker-integration',$2) RETURNING id`,
            [`worker:${integration}`, project.id],
          );
          key = result.rows[0].id as string;
        }
        const id = existing?.id ?? randomUUID();
        const token = await this.jwt.signWorkerApiKeyToken(
          project.service_role_role,
          key!,
          project.id,
          ttl,
        );
        // Persist the exact JWT expiry; database and signer clocks must not extend a lease
        // beyond its associated credential's actual lifetime.
        const expires = new Date(
          (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp as number) *
            1000,
        );
        await db.query(
          `INSERT INTO platform.worker_project_leases(id,grant_id,api_key_id,expires_at)
        VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET expires_at=$4,last_renewed_at=now()`,
          [id, grant.id, key, expires],
        );
        return {
          lease_id: id,
          project_id: project.id,
          schema_name: project.schema_name,
          service_role: project.service_role_role,
          api_key: token,
          expires_at: expires.toISOString(),
        };
      },
    );
    this.audit.record(null, leaseId ? 'worker.lease_renewed' : 'worker.lease_created', null, null, {
      integrationId: integration,
      leaseId: result.lease_id,
      projectId: result.project_id,
      expiresAt: result.expires_at,
    });
    return result;
  }
  async resolve(integration: string, lease: string, name: string) {
    return this.repo.authorized(integration, null, lease, async (db, grant) => {
      if (!grant.allowed_secret_names.includes(name))
        throw new NotFoundException('Worker resource unavailable');
      const value = await this.vault.resolveForFunction(grant.project_id, name, db);
      if (value === null) throw new NotFoundException('Worker resource unavailable');
      this.audit.record(null, 'worker.secret_read', null, null, {
        integrationId: integration,
        leaseId: lease,
        projectId: grant.project_id,
        name,
      });
      return { value };
    });
  }
}
