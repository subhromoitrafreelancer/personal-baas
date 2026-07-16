import { Injectable } from '@nestjs/common';
import { AdminUsersService } from '../admin-users/admin-users.service';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { DbExplorerService } from '../db-explorer/db-explorer.service';
import { ProjectsService } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  schemaName: string;
  tableCount: number;
  unprotectedTableCount: number;
  userCount: number;
  activeKeyCount: number;
  publishableKeyCount: number;
  secretKeyCount: number;
}

export interface StorageSummary {
  bucketCount: number;
  objectCount: number;
  totalBytes: number;
  emptyBucketCount: number;
}

export interface DashboardSummary {
  projects: ProjectSummary[];
  storage: StorageSummary;
}

@Injectable()
export class DashboardSummaryService {
  constructor(
    private readonly projects: ProjectsService,
    private readonly dbExplorer: DbExplorerService,
    private readonly adminUsers: AdminUsersService,
    private readonly apiKeys: ApiKeysService,
    private readonly storage: StorageService,
  ) {}

  async getSummary(): Promise<DashboardSummary> {
    const [projects, dbObjects, storage] = await Promise.all([
      this.projects.list(),
      this.dbExplorer.getDatabaseObjects(),
      this.storage.getStats(),
    ]);

    const projectSummaries = await Promise.all(
      projects.map(async (project): Promise<ProjectSummary> => {
        const [{ total: userCount }, keys] = await Promise.all([
          this.adminUsers.list(null, 1, 0, project.id),
          this.apiKeys.list(project.id),
        ]);

        const schema = dbObjects.schemas.find((s) => s.name === project.schema_name);
        const tables = schema?.tables ?? [];
        const unprotectedTableCount = tables.filter((t) => t.apiExposed && !t.rlsEnabled).length;

        const activeKeys = keys.filter((key) => !key.revokedAt);
        const publishableKeyCount = activeKeys.filter((key) => key.kind === 'publishable').length;
        const secretKeyCount = activeKeys.filter((key) => key.kind === 'secret').length;

        return {
          id: project.id,
          slug: project.slug,
          name: project.name,
          schemaName: project.schema_name,
          tableCount: tables.length,
          unprotectedTableCount,
          userCount,
          activeKeyCount: activeKeys.length,
          publishableKeyCount,
          secretKeyCount,
        };
      }),
    );

    return { projects: projectSummaries, storage };
  }
}
