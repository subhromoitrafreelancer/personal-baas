import { ConflictException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ProjectRow, ProjectsRepository } from './projects.repository';
import { validateProjectSlug } from './project-slug.util';

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

  /**
   * Interim stand-in for real project resolution: every auth/api-key call site is required
   * to pass a projectId (scope.md §23 point 3), but the bearer-token-based resolution that
   * determines *which* project a request belongs to isn't wired up until Phase 9 PR5. Until
   * then, every caller resolves against the default project, which is behaviorally identical
   * to today's single-project behavior. Throws rather than re-seeding — by the time any
   * request reaches this, ensureDefaultProject() has already run at boot.
   */
  async getDefault(): Promise<ProjectRow> {
    const project = await this.repository.findBySlug(DEFAULT_PROJECT_SLUG);
    if (!project) {
      throw new InternalServerErrorException('Default project is missing');
    }
    return project;
  }

  /**
   * Creates a new project: its own api_<slug> schema and anon_<slug>/authenticated_<slug>/
   * service_role_<slug> Postgres roles (scope.md §23) — never invoked for the default
   * project, whose schema/roles predate this table (see ensureDefaultProject()).
   */
  async create(input: { slug: string; name: string }): Promise<ProjectRow> {
    validateProjectSlug(input.slug);

    const existing = await this.repository.findBySlug(input.slug);
    if (existing) {
      throw new ConflictException(`A project with slug '${input.slug}' already exists`);
    }

    const schemaName = `api_${input.slug}`;
    const anonRole = `anon_${input.slug}`;
    const authenticatedRole = `authenticated_${input.slug}`;
    const serviceRoleRole = `service_role_${input.slug}`;

    const schemaAlreadyExists = await this.repository.schemaExists(schemaName);
    if (schemaAlreadyExists) {
      throw new ConflictException(
        `Schema "${schemaName}" already exists in the database but isn't tracked as a project`,
      );
    }

    await this.repository.provisionSchemaAndRoles({
      schemaName,
      anonRole,
      authenticatedRole,
      serviceRoleRole,
    });

    return this.repository.insert({
      slug: input.slug,
      name: input.name,
      schemaName,
      anonRole,
      authenticatedRole,
      serviceRoleRole,
    });
  }
}
