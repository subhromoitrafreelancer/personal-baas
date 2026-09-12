import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthAuditService } from '../auth/auth-audit.service';
import { VaultCryptoService } from './vault-crypto.service';
import { VaultRepository } from './vault.repository';
import { VaultSecretMetadata } from './vault.types';

function toMetadata(row: { id: string; name: string; updated_at: Date }): VaultSecretMetadata {
  return { id: row.id, name: row.name, updatedAt: row.updated_at.toISOString() };
}

@Injectable()
export class VaultService {
  constructor(
    private readonly repo: VaultRepository,
    private readonly crypto: VaultCryptoService,
    private readonly audit: AuthAuditService,
  ) {}

  async list(projectId: string): Promise<VaultSecretMetadata[]> {
    const rows = await this.repo.listMetadata(projectId);
    return rows.map(toMetadata);
  }

  // Create and rotate are the same admin action (scope.md §30 point 4) — unlike API keys, the
  // value is supplied by the admin, not generated here, so there is nothing to echo back: the
  // response is metadata only, never the value that was just submitted.
  async upsert(
    projectId: string,
    name: string,
    value: string,
    adminEmail: string,
  ): Promise<VaultSecretMetadata> {
    const { nonce, ciphertext } = this.crypto.encrypt(value);
    const existing = await this.repo.findByProjectAndName(projectId, name);
    const row = await this.repo.upsert(projectId, name, nonce, ciphertext);
    this.audit.record(
      null,
      existing ? 'vault.secret_rotated' : 'vault.secret_created',
      null,
      null,
      {
        name,
        projectId,
        rotatedBy: adminEmail,
      },
    );
    return toMetadata(row);
  }

  async delete(id: string, projectId: string, adminEmail: string): Promise<{ deleted: true }> {
    const row = await this.repo.deleteById(id, projectId);
    if (!row) {
      throw new NotFoundException('Secret not found');
    }
    this.audit.record(null, 'vault.secret_deleted', null, null, {
      name: row.name,
      projectId,
      deletedBy: adminEmail,
    });
    return { deleted: true };
  }

  // The one method that actually decrypts a value. Originally used only by the internal
  // invocation-token-authorized endpoint (VaultInternalController); EmailModule (scope.md §32
  // point 3) also calls this directly in-process to resolve a project's EMAIL_PROVIDER_SECRET
  // when actually sending mail — a legitimate second caller, not a workaround, since sending
  // also happens inside control-server's own process. Never called from any admin-facing
  // controller. Deliberately no audit event per call (scope.md §30 point 7): a per-invocation
  // read is potentially high-volume, unlike every other event this platform audits today.
  async resolveForFunction(projectId: string, name: string): Promise<string | null> {
    const row = await this.repo.findByProjectAndName(projectId, name);
    if (!row) {
      return null;
    }
    return this.crypto.decrypt(row.nonce, row.ciphertext);
  }
}
