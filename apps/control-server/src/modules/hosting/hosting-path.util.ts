import { BadRequestException } from '@nestjs/common';

// Zip entry names are plain POSIX-style strings (e.g. "assets/logo.png"), not Express's
// already-decoded route-segment arrays (contrast storage-path.util.ts's normalizeObjectPath,
// which handles the latter) — so this validates by splitting on '/' itself. Rejecting empty/
// '.'/'..' segments and any leading '/' matters for the same reason it does in storage: file
// keys in MinIO are built as `hosting/<project_id>/<path>` in one shared bucket, so an
// unsanitized '..' could let a deploy escape its own project's key prefix (zip-slip).
export function normalizeHostingEntryPath(entryName: string): string {
  const trimmed = entryName.replace(/\/+$/, '');
  const parts = trimmed.split('/');
  if (parts.length === 0 || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new BadRequestException(`Invalid file path in zip: "${entryName}"`);
  }
  return parts.join('/');
}

// GET /sites/:project/*path arrives as Express's decoded-segment-array form, same shape as
// storage's downloads — reused validation logic, but hosting doesn't import storage's util
// directly since an empty path here means "serve the site root", not an error (storage always
// requires a path).
export function normalizeSitePath(segments: string[] | string | undefined): string[] {
  const parts = Array.isArray(segments) ? segments : segments ? [segments] : [];
  const nonEmpty = parts.filter((part) => part !== '');
  for (const part of nonEmpty) {
    if (part === '.' || part === '..') {
      throw new BadRequestException('Invalid path');
    }
  }
  return nonEmpty;
}
