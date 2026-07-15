// The only file you need to edit after copying this directory elsewhere.
//
// baseUrl   — the single public entry point of your personal-baas deployment
//              (Caddy, scope.md §13), e.g. http://localhost:8000
// anonKey   — a freshly minted "publishable" API key (role: anon), created via
//              /admin/api-keys in the admin console. See README.md for setup steps.
window.APP_CONFIG = {
  baseUrl: 'http://localhost:8000',
  anonKey: 'REPLACE_WITH_A_FRESH_PUBLISHABLE_KEY',
};
