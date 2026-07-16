import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile } from 'node:fs/promises';
import { EnvConfig } from '../../config/env.schema';

const DB_SCHEMAS_LINE = /^db-schemas\s*=\s*"([^"]*)"\s*$/m;

// Rewrites the shared postgrest.conf volume's db-schemas line as projects are created
// (scope.md §23 point 7). PostgREST only reads this file at startup — it never auto-reloads
// it — so this only prepares the change; a human still runs `docker compose restart postgrest`
// to make a new project's schema reachable through the REST API.
@Injectable()
export class PostgrestConfigService {
  private readonly logger = new Logger(PostgrestConfigService.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  private get path(): string {
    return this.config.get('POSTGREST_CONFIG_PATH', { infer: true });
  }

  async addSchema(schemaName: string): Promise<void> {
    const content = await readFile(this.path, 'utf8');
    const match = content.match(DB_SCHEMAS_LINE);
    if (!match) {
      throw new InternalServerErrorException(
        `${this.path} has no db-schemas line — refusing to guess where to add "${schemaName}"`,
      );
    }

    const schemas = match[1]
      .split(',')
      .map((schema) => schema.trim())
      .filter(Boolean);
    if (schemas.includes(schemaName)) {
      return;
    }
    schemas.push(schemaName);

    const updated = content.replace(DB_SCHEMAS_LINE, `db-schemas = "${schemas.join(', ')}"`);
    await writeFile(this.path, updated, 'utf8');
    this.logger.warn(
      `Added "${schemaName}" to ${this.path}'s db-schemas. Run "docker compose restart postgrest" ` +
        'to make it reachable through the REST API.',
    );
  }
}
