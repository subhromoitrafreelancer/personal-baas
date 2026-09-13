import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PdfProviderConfigRow, PdfResponseMode } from './pdf.types';

export interface UpsertPdfProviderConfigInput {
  apiUrl: string;
  authHeader: string | null;
  htmlField: string;
  responseMode: PdfResponseMode;
  enabled: boolean;
}

@Injectable()
export class PdfProviderConfigsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByProjectId(projectId: string): Promise<PdfProviderConfigRow | null> {
    const { rows } = await this.pool.query<PdfProviderConfigRow>(
      'SELECT * FROM pdf.provider_configs WHERE project_id = $1',
      [projectId],
    );
    return rows[0] ?? null;
  }

  // One active config per project (scope.md §34 point 2) — a second save just overwrites the
  // first, same "one active X per project" upsert shape as email.provider_configs.
  async upsert(
    projectId: string,
    input: UpsertPdfProviderConfigInput,
  ): Promise<PdfProviderConfigRow> {
    const { rows } = await this.pool.query<PdfProviderConfigRow>(
      `INSERT INTO pdf.provider_configs
         (project_id, api_url, auth_header, html_field, response_mode, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id) DO UPDATE SET
         api_url = excluded.api_url,
         auth_header = excluded.auth_header,
         html_field = excluded.html_field,
         response_mode = excluded.response_mode,
         enabled = excluded.enabled,
         updated_at = now()
       RETURNING *`,
      [
        projectId,
        input.apiUrl,
        input.authHeader,
        input.htmlField,
        input.responseMode,
        input.enabled,
      ],
    );
    return rows[0];
  }
}
