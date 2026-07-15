import { BadRequestException } from '@nestjs/common';

// Express 5's wildcard route params (`*path`) come back as an array of decoded segments.
// Rejecting `.`/`..`/empty segments matters beyond tidiness here: object keys in MinIO are
// built as `${bucket.id}/${path}` in one shared real bucket (scope.md §21), so an unsanitized
// `..` could let a caller read or overwrite another logical bucket's objects.
export function normalizeObjectPath(segments: string[] | string | undefined): string {
  const parts = Array.isArray(segments) ? segments : segments ? [segments] : [];
  if (parts.length === 0) {
    throw new BadRequestException('An object path is required');
  }
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      throw new BadRequestException('Invalid object path');
    }
  }
  return parts.join('/');
}
