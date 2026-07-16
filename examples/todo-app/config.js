// The only file you need to edit after copying this directory elsewhere.
//
// baseUrl    — the single public entry point of your personal-baas deployment
//              (Caddy, scope.md §13), e.g. http://localhost:8000
// anonKey    — a freshly minted "publishable" API key (role: anon), created via
//              /admin/api-keys in the admin console. See README.md for setup steps.
// schemaName — the Postgres schema of the project this app talks to (Phase 9, scope.md §23).
//              Must match the project your anonKey belongs to. Defaults to "api", the
//              always-present default project — leave as-is unless you created a separate
//              project for this app (see README.md "Using a different project").
window.APP_CONFIG = {
  baseUrl: 'http://localhost:8000',
  anonKey: 'REPLACE_WITH_A_FRESH_PUBLISHABLE_KEY',
  schemaName: 'api',
};
