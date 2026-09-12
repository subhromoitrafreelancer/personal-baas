import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { EmailSentMessageRow } from './email.types';

export interface RecordSentMessageInput {
  projectId: string;
  toAddress: string;
  subject: string;
  provider: string | null;
  status: 'sent' | 'failed';
  providerMessageId: string | null;
  error: string | null;
}

@Injectable()
export class EmailSentMessagesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(input: RecordSentMessageInput): Promise<void> {
    await this.pool.query(
      `INSERT INTO email.sent_messages
         (project_id, to_address, subject, provider, status, provider_message_id, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.projectId,
        input.toAddress,
        input.subject,
        input.provider,
        input.status,
        input.providerMessageId,
        input.error,
      ],
    );
  }

  async listByProject(projectId: string, limit: number): Promise<EmailSentMessageRow[]> {
    const { rows } = await this.pool.query<EmailSentMessageRow>(
      `SELECT * FROM email.sent_messages WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [projectId, limit],
    );
    return rows;
  }
}
