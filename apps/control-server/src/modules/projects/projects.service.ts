import { Injectable, Logger } from '@nestjs/common';
import { ProjectRow, ProjectsRepository } from './projects.repository';

export const DEFAULT_PROJECT_SLUG = 'default';

// Legacy unsuffixed names, matching what the original Phase 0 bootstrap
// (packages/database-bootstrap) actually created — see the seeding migration
// (1784500000000_create-projects.ts) and scope.md §23 for why this project is a named
// exception to the api_<slug>/<role>_<slug> pattern every later project follows.
const DEFAULT_PROJECT = {
  slug: DEFAULT_PROJECT_SLUG,
  name: 'Default Project',
  schemaName: 'api',
  anonRole: 'anon',
  authenticatedRole: 'authenticated',
  serviceRoleRole: 'service_role',
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(private readonly repository: ProjectsRepository) {}

  /**
   * Idempotent invariant: an admin is never seeded without at least one project present
   * (scope.md §23). Normally a no-op — the seeding migration already inserts this row —
   * this is a defensive fallback for the case where platform.projects exists but is empty.
   */
  async ensureDefaultProject(): Promise<ProjectRow> {
    const existing = await this.repository.findBySlug(DEFAULT_PROJECT_SLUG);
    if (existing) {
      return existing;
    }

    const created = await this.repository.insert(DEFAULT_PROJECT);
    this.logger.warn(
      "Default project row was missing at boot and has been re-seeded. This normally " +
        'happens once via migration — seeing this log after the first boot may indicate the ' +
        'platform.projects row was deleted.',
    );
    return created;
  }
}
