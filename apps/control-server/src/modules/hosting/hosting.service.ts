import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import * as mime from 'mime-types';
import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';
import { EnvConfig } from '../../config/env.schema';
import { MINIO_CLIENT } from '../storage/minio-client.provider';
import { HostingSiteFilesRepository } from './hosting-site-files.repository';
import { HostingSitesRepository } from './hosting-sites.repository';
import { normalizeHostingEntryPath } from './hosting-path.util';
import { HOSTING_MAX_DEPLOY_BYTES, HOSTING_MAX_FILE_COUNT } from './hosting-upload-limit';

// Physical MinIO key layout mirrors storage's ${bucket.id}/${path} pattern (scope.md §21/§24/
// §25 point 2) — namespaced by the project's own UUID, so cross-project key collisions are
// impossible at the storage-backend level regardless of anything above it.
function siteObjectKey(projectId: string, path: string): string {
  return `hosting/${projectId}/${path}`;
}

function hasFileExtension(path: string): boolean {
  const last = path.split('/').pop() ?? '';
  return last.includes('.');
}

interface ParsedDeployFile {
  path: string;
  size: number;
  contentType: string | null;
  data: Buffer;
}

@Injectable()
export class HostingService {
  private readonly minioBucket: string;

  constructor(
    @Inject(MINIO_CLIENT) private readonly minio: MinioClient,
    private readonly sites: HostingSitesRepository,
    private readonly files: HostingSiteFilesRepository,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.minioBucket = config.get('MINIO_BUCKET', { infer: true });
  }

  // Full-replace deploy (scope.md §25 point 3). Ordering is deliberately fail-safe: new files
  // are uploaded to MinIO *before* the DB row swap, and old-deployment MinIO objects are only
  // cleaned up *after* that swap commits — so a failure at any point either leaves the previous
  // deployment fully intact and serving (upload failure, DB failure) or, at worst, leaves a few
  // now-unreachable orphaned MinIO objects behind (cleanup failure) — never a site that's
  // half-replaced and serving a broken mix of old and new files.
  async deploy(projectId: string, zipBuffer: Buffer): Promise<{ fileCount: number; totalBytes: number; deployedAt: Date }> {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    if (entries.length === 0) {
      throw new BadRequestException('Zip contains no files');
    }
    if (entries.length > HOSTING_MAX_FILE_COUNT) {
      throw new PayloadTooLargeException(`Zip contains more than ${HOSTING_MAX_FILE_COUNT} files`);
    }

    const parsed: ParsedDeployFile[] = [];
    let totalBytes = 0;
    for (const entry of entries) {
      const path = normalizeHostingEntryPath(entry.entryName);
      totalBytes += entry.header.size;
      if (totalBytes > HOSTING_MAX_DEPLOY_BYTES) {
        throw new PayloadTooLargeException(
          `Uncompressed deploy size exceeds the ${HOSTING_MAX_DEPLOY_BYTES} byte limit`,
        );
      }
      const contentType = mime.lookup(path) || null;
      parsed.push({ path, size: entry.header.size, contentType, data: entry.getData() });
    }
    if (!parsed.some((file) => file.path === 'index.html')) {
      throw new BadRequestException('Zip must contain an index.html at its root');
    }

    const site = await this.sites.findOrCreateByProjectId(projectId);
    const oldFiles = await this.files.listBySite(site.id);
    const oldPaths = new Set(oldFiles.map((file) => file.path));

    for (const file of parsed) {
      await this.minio.putObject(
        this.minioBucket,
        siteObjectKey(projectId, file.path),
        file.data,
        file.size,
        file.contentType ? { 'Content-Type': file.contentType } : undefined,
      );
    }

    await this.files.replaceAll(
      site.id,
      parsed.map((file) => ({ path: file.path, size: file.size, contentType: file.contentType })),
    );

    const newPaths = new Set(parsed.map((file) => file.path));
    const orphanedPaths = [...oldPaths].filter((path) => !newPaths.has(path));
    for (const path of orphanedPaths) {
      await this.minio.removeObject(this.minioBucket, siteObjectKey(projectId, path)).catch(() => undefined);
    }

    return { fileCount: parsed.length, totalBytes, deployedAt: new Date() };
  }

  async getStats(projectId: string): Promise<{ fileCount: number; totalBytes: number; lastDeployedAt: string | null }> {
    const site = await this.sites.findByProjectId(projectId);
    if (!site) {
      return { fileCount: 0, totalBytes: 0, lastDeployedAt: null };
    }
    const rows = await this.files.listBySite(site.id);
    const totalBytes = rows.reduce((sum, row) => sum + Number(row.size), 0);
    const lastDeployedAt = rows.reduce<Date | null>(
      (latest, row) => (!latest || row.deployed_at > latest ? row.deployed_at : latest),
      null,
    );
    return { fileCount: rows.length, totalBytes, lastDeployedAt: lastDeployedAt?.toISOString() ?? null };
  }

  // SPA fallback (scope.md §25 point 4): an extensionless path with no matching file serves
  // index.html instead of 404 — the standard behavior client-rendered SPA routers expect. A path
  // with an extension (a genuinely missing asset) 404s normally, no fallback.
  async serveFile(
    projectId: string,
    pathSegments: string[],
  ): Promise<{ stream: Readable; contentType: string | null; size: number }> {
    const site = await this.sites.findByProjectId(projectId);
    if (!site) {
      throw new NotFoundException('Site not found');
    }

    const requestedPath = pathSegments.length === 0 ? 'index.html' : pathSegments.join('/');
    let file = await this.files.findBySiteAndPath(site.id, requestedPath);
    if (!file && !hasFileExtension(requestedPath)) {
      file = await this.files.findBySiteAndPath(site.id, 'index.html');
    }
    if (!file) {
      throw new NotFoundException('Not found');
    }

    const stream = await this.minio.getObject(this.minioBucket, siteObjectKey(projectId, file.path));
    return { stream, contentType: file.content_type, size: Number(file.size) };
  }
}
