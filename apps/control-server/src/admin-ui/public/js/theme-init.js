// Applies any stored theme choice before first paint (FOUC prevention). Loaded as a blocking
// <script src> (no defer/async) from <head> so it runs before CSS paints — a same-origin
// external file needs no CSP change, unlike an inline <script> block under this app's
// script-src 'self' policy (main.ts's helmet() config, no 'unsafe-inline'/nonce).
(function () {
  try {
    var stored = localStorage.getItem('baas-admin-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {
    /* localStorage unavailable (private mode, etc.) — falls back to prefers-color-scheme */
  }
})();
