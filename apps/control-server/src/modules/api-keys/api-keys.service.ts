import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthAuditService } from '../auth/auth-audit.service';
import { AuthJwtService } from '../auth/auth-jwt.service';
import { ProjectsService } from '../projects/projects.service';
import { ApiKeysRepository } from './api-keys.repository';

function toPublicKey(row: {
  id: string;
  project_id: string;
  name: string;
  kind: string;
  created_at: Date;
  created_by: string;
  revoked_at: Date | null;
  revoked_by: string | null;
}) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    revokedBy: row.revoked_by,
  };
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly apiKeysRepo: ApiKeysRepository,
    private readonly jwt: AuthJwtService,
    private readonly audit: AuthAuditService,
    private readonly projects: ProjectsService,
  ) {}

  async list(projectId?: string) {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();
    const rows = await this.apiKeysRepo.list(project.id);
    return rows.map(toPublicKey);
  }

  async create(name: string, kind: 'publishable' | 'secret', adminEmail: string, projectId?: string) {
    const project = projectId ? await this.projects.getById(projectId) : await this.projects.getDefault();
    const row = await this.apiKeysRepo.create(name, kind, adminEmail, project.id);
    const role = kind === 'publishable' ? project.anon_role : project.service_role_role;
    const token = await this.jwt.signApiKeyToken(role, row.id, project.id);
    this.audit.record(null, 'admin.api_key_created', null, null, { name, kind, createdBy: adminEmail });
    return { ...toPublicKey(row), token };
  }

  async revoke(id: string, adminEmail: string) {
    const row = await this.apiKeysRepo.revoke(id, adminEmail);
    if (!row) {
      throw new NotFoundException('API key not found or already revoked');
    }
    this.audit.record(null, 'admin.api_key_revoked', null, null, { name: row.name, revokedBy: adminEmail });
    return toPublicKey(row);
  }

  // Publishable/anon keys are meant to be public-safe (like a Supabase anon key), so re-signing
  // one on demand is low risk — the token was never stored in the first place since it's a pure
  // function of role+kid (see AuthJwtService.signApiKeyToken). Secret/service_role keys bypass
  // RLS entirely and deliberately stay one-time-reveal (Phase 4.4 design) — not exposed here.
  async reveal(id: string, adminEmail: string) {
    const row = await this.apiKeysRepo.findById(id);
    if (!row) {
      throw new NotFoundException('API key not found');
    }
    if (row.kind !== 'publishable') {
      throw new BadRequestException('Only publishable keys can be viewed again');
    }
    if (row.revoked_at) {
      throw new BadRequestException('This key has been revoked');
    }
    const project = await this.projects.getById(row.project_id);
    const token = await this.jwt.signApiKeyToken(project.anon_role, row.id, project.id);
    this.audit.record(null, 'admin.api_key_viewed', null, null, { name: row.name, viewedBy: adminEmail });
    return { token };
  }
}
