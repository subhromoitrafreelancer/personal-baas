import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { EmailProviderConfigRow, EmailProviderKind } from './email.types';

export interface UpsertProviderConfigInput {
  provider: EmailProviderKind;
  fromAddress: string;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean | null;
  smtpUsername: string | null;
  enabled: boolean;
}

@Injectable()
export class EmailProviderConfigsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByProjectId(projectId: string): Promise<EmailProviderConfigRow | null> {
    const { rows } = await this.pool.query<EmailProviderConfigRow>(
      'SELECT * FROM email.provider_configs WHERE project_id = $1',
      [projectId],
    );
    return rows[0] ?? null;
  }

  // One active config per project (scope.md §32 point 2) — a second save just overwrites the
  // first, same "one active X per project" upsert shape as ai.provider_configs (§35).
  async upsert(
    projectId: string,
    input: UpsertProviderConfigInput,
  ): Promise<EmailProviderConfigRow> {
    const { rows } = await this.pool.query<EmailProviderConfigRow>(
      `INSERT INTO email.provider_configs
         (project_id, provider, from_address, smtp_host, smtp_port, smtp_secure, smtp_username, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (project_id) DO UPDATE SET
         provider = excluded.provider,
         from_address = excluded.from_address,
         smtp_host = excluded.smtp_host,
         smtp_port = excluded.smtp_port,
         smtp_secure = excluded.smtp_secure,
         smtp_username = excluded.smtp_username,
         enabled = excluded.enabled,
         updated_at = now()
       RETURNING *`,
      [
        projectId,
        input.provider,
        input.fromAddress,
        input.smtpHost,
        input.smtpPort,
        input.smtpSecure,
        input.smtpUsername,
        input.enabled,
      ],
    );
    return rows[0];
  }
}
