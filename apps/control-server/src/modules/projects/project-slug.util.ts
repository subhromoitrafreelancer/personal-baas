import { BadRequestException } from '@nestjs/common';

const SLUG_PATTERN = /^[a-z][a-z0-9_]{2,30}$/;

// Reserved so a new project's derived api_<slug> schema / <role>_<slug> roles can never be
// confused with the platform's own fixed schemas/roles (scope.md §23). 'default' is reserved
// too — that's the pre-existing project's slug (see DEFAULT_PROJECT_SLUG in projects.service.ts),
// already unique-constrained at the DB level, but this gives a clearer error before hitting it.
const RESERVED_SLUGS = new Set([
  'platform',
  'auth',
  'api',
  'private',
  'storage',
  'public',
  'default',
]);

export function validateProjectSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new BadRequestException(
      'Project slug must be lowercase letters, digits, and underscores, starting with a ' +
        'letter, 3-31 characters long',
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new BadRequestException(`Project slug '${slug}' is reserved`);
  }
}
