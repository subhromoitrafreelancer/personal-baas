import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthAuditService } from '../auth/auth-audit.service';
import { AuthJwtService } from '../auth/auth-jwt.service';
import { ApiKeysRepository } from './api-keys.repository';

function toPublicKey(row: {
  id: string;
  name: string;
  kind: string;
  created_at: Date;
  created_by: string;
  revoked_at: Date | null;
  revoked_by: string | null;
}) {
  return {
    id: row.id,
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
  ) {}

  async list() {
    const rows = await this.apiKeysRepo.list();
    return rows.map(toPublicKey);
  }

  async create(name: string, kind: 'publishable' | 'secret', adminEmail: string) {
    const row = await this.apiKeysRepo.create(name, kind, adminEmail);
    const role = kind === 'publishable' ? 'anon' : 'service_role';
    const token = await this.jwt.signApiKeyToken(role, row.id);
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
}
