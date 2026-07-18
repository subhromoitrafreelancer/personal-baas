import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';
import { EnvConfig } from '../../config/env.schema';
import { MINIO_CLIENT } from './minio-client.provider';
import { StorageBucketsRepository } from './storage-buckets.repository';
import { StorageObjectsRepository } from './storage-objects.repository';
import { StorageBucketRow, StorageObjectRow } from './storage.types';

// Callers of the storage service come from two distinct trust levels: the platform admin
// console (full access, no ownership concept — mirrors service_role) and application users
// authenticated via their own JWT (owner-based access, scope.md §21 point 4). Keeping these
// as a discriminated union rather than a generic "role" string makes it impossible to
// accidentally grant admin-level access to an app-user request. Both variants carry a
// projectId (Phase 10, scope.md §24) — for app-user requests this is the caller's own JWT
// projectId claim; for admin requests it's resolved by the admin controller from an optional
// ?projectId= query param, same convention as ApiKeysService. Bucket lookups are always scoped
// to this projectId, never to name alone — that's the actual cross-project isolation boundary.
export type StorageRequester =
  | { kind: 'admin'; projectId: string }
  | { kind: 'app-user'; sub: string; role: string; projectId: string };

function toPublicBucket(row: StorageBucketRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    public: row.public,
    sizeLimitBytes: row.size_limit_bytes,
    createdAt: row.created_at.toISOString(),
  };
}

function toPublicObject(row: StorageObjectRow) {
  return {
    id: row.id,
    path: row.path,
    owner: row.owner,
    size: row.size,
    contentType: row.content_type,
    createdAt: row.created_at.toISOString(),
  };
}

function objectKey(bucket: StorageBucketRow, path: string): string {
  return `${bucket.id}/${path}`;
}

function canRead(requester: StorageRequester, bucket: StorageBucketRow, object: StorageObjectRow): boolean {
  if (bucket.public) return true;
  if (requester.kind === 'admin') return true;
  if (requester.role === 'service_role') return true;
  return object.owner !== null && object.owner === requester.sub;
}

function canWrite(requester: StorageRequester, object: StorageObjectRow | null): boolean {
  if (requester.kind === 'admin') return true;
  if (requester.role === 'service_role') return true;
  if (!object) return false;
  return object.owner !== null && object.owner === requester.sub;
}

@Injectable()
export class StorageService {
  private readonly minioBucket: string;

  constructor(
    @Inject(MINIO_CLIENT) private readonly minio: MinioClient,
    private readonly buckets: StorageBucketsRepository,
    private readonly objects: StorageObjectsRepository,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.minioBucket = config.get('MINIO_BUCKET', { infer: true });
  }

  async createBucket(projectId: string, name: string, isPublic: boolean, sizeLimitBytes: number | null) {
    const existing = await this.buckets.findByName(projectId, name);
    if (existing) {
      throw new ForbiddenException(`Bucket "${name}" already exists`);
    }
    const row = await this.buckets.create(projectId, name, isPublic, sizeLimitBytes);
    return toPublicBucket(row);
  }

  async listBuckets(projectId: string) {
    const rows = await this.buckets.list(projectId);
    return rows.map(toPublicBucket);
  }

  async listObjects(projectId: string, bucketName: string) {
    const bucket = await this.getBucketOrThrow(projectId, bucketName);
    const rows = await this.objects.listByBucket(bucket.id);
    return rows.map(toPublicObject);
  }

  async getStats() {
    return this.buckets.getStats();
  }

  async uploadObject(params: {
    bucketName: string;
    path: string;
    requester: StorageRequester;
    buffer: Buffer;
    contentType: string | null;
  }) {
    if (params.requester.kind === 'app-user' && params.requester.role === 'anon') {
      throw new ForbiddenException('Anonymous requests cannot upload objects');
    }

    const bucket = await this.getBucketOrThrow(params.requester.projectId, params.bucketName);
    if (bucket.size_limit_bytes !== null && params.buffer.length > Number(bucket.size_limit_bytes)) {
      throw new PayloadTooLargeException(
        `Object exceeds bucket "${bucket.name}"'s size limit of ${bucket.size_limit_bytes} bytes`,
      );
    }

    const existing = await this.objects.findByBucketAndPath(bucket.id, params.path);
    if (existing && !canWrite(params.requester, existing)) {
      throw new ForbiddenException('You do not have permission to overwrite this object');
    }

    await this.minio.putObject(
      this.minioBucket,
      objectKey(bucket, params.path),
      params.buffer,
      params.buffer.length,
      params.contentType ? { 'Content-Type': params.contentType } : undefined,
    );

    const owner = params.requester.kind === 'admin' ? null : params.requester.sub;
    const row = await this.objects.upsert({
      bucketId: bucket.id,
      path: params.path,
      owner,
      size: params.buffer.length,
      contentType: params.contentType,
    });
    return toPublicObject(row);
  }

  async downloadObject(params: {
    bucketName: string;
    path: string;
    requester: StorageRequester;
  }): Promise<{ stream: Readable; contentType: string | null; size: number }> {
    const bucket = await this.getBucketOrThrow(params.requester.projectId, params.bucketName);
    const object = await this.objects.findByBucketAndPath(bucket.id, params.path);
    if (!object) {
      throw new NotFoundException('Object not found');
    }
    if (!canRead(params.requester, bucket, object)) {
      throw new ForbiddenException('You do not have permission to read this object');
    }

    const stream = await this.minio.getObject(this.minioBucket, objectKey(bucket, params.path));
    return { stream, contentType: object.content_type, size: Number(object.size) };
  }

  async deleteObject(params: { bucketName: string; path: string; requester: StorageRequester }) {
    const bucket = await this.getBucketOrThrow(params.requester.projectId, params.bucketName);
    const object = await this.objects.findByBucketAndPath(bucket.id, params.path);
    if (!object) {
      throw new NotFoundException('Object not found');
    }
    if (!canWrite(params.requester, object)) {
      throw new ForbiddenException('You do not have permission to delete this object');
    }

    await this.minio.removeObject(this.minioBucket, objectKey(bucket, params.path));
    await this.objects.delete(bucket.id, params.path);
  }

  // Scoped to (projectId, name), never name alone — this is the actual cross-project isolation
  // boundary (scope.md §24 point 4). A project-B caller asking for a bucket that only exists in
  // project A gets the same 404 as a bucket that doesn't exist at all, never a 403 — it must not
  // be possible to detect another project's bucket names by probing.
  private async getBucketOrThrow(projectId: string, name: string): Promise<StorageBucketRow> {
    const bucket = await this.buckets.findByName(projectId, name);
    if (!bucket) {
      throw new NotFoundException(`Bucket "${name}" not found`);
    }
    return bucket;
  }
}
