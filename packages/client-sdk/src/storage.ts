import { HttpClient } from './http';

export interface StorageObjectInfo {
  id: string;
  path: string;
  owner: string | null;
  size: number;
  contentType: string | null;
  createdAt: string;
}

// Wraps /storage/v1/object/:bucket/*path (Phase 7, scope.md §21) -- the same Authorization:
// Bearer header as /rest/v1 and /auth/v1, no Accept/Content-Profile schema header since storage
// isn't schema-scoped. Kept separate from QueryBuilder/AuthClient since the wire format here is
// multipart-upload-in, raw-bytes-out rather than JSON in/out.
export class StorageClient {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async upload(bucket: string, path: string, file: File | Blob): Promise<StorageObjectInfo> {
    const form = new FormData();
    form.append('file', file);
    const res = await this.http.request(`/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      body: form,
      isRest: false,
    });
    return this.parseJsonOrThrow<StorageObjectInfo>(res);
  }

  async download(bucket: string, path: string): Promise<Blob> {
    const res = await this.http.request(`/storage/v1/object/${bucket}/${path}`, {
      method: 'GET',
      isRest: false,
    });
    if (!res.ok) {
      await this.parseJsonOrThrow(res);
    }
    return res.blob();
  }

  async remove(bucket: string, path: string): Promise<void> {
    const res = await this.http.request(`/storage/v1/object/${bucket}/${path}`, {
      method: 'DELETE',
      isRest: false,
    });
    await this.parseJsonOrThrow(res);
  }

  private async parseJsonOrThrow<T = unknown>(res: Response): Promise<T> {
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const parsed = body as { message?: unknown; error?: unknown } | null;
      const message = (parsed && (parsed.message ?? parsed.error)) ?? res.statusText;
      throw new Error(Array.isArray(message) ? message.join(', ') : String(message));
    }
    return body as T;
  }
}
