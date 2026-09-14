document.querySelectorAll('.rail-link[href]').forEach((link) => {
  if (link.getAttribute('href') === location.pathname) {
    link.classList.add('active');
  }
});

const railToggle = document.getElementById('rail-toggle');
const tabRail = document.getElementById('tab-rail');
if (railToggle && tabRail) {
  railToggle.addEventListener('click', () => {
    const open = tabRail.classList.toggle('rail-open');
    railToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  tabRail.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      tabRail.classList.remove('rail-open');
      railToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Direction contract's signature interaction, authored once here rather than scattered per
// page: any element marked data-live gets a brief "value-tick" flash whenever its text content
// changes, so a live count/status reads as a visible instrument event, not a silent DOM swap.
// Pages opt in by adding data-live to an element they already update via textContent/innerHTML.
const liveObserver = new MutationObserver((mutations) => {
  const seen = new Set();
  mutations.forEach((mutation) => {
    const el = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
    const liveEl = el && el.closest('[data-live]');
    if (liveEl && !seen.has(liveEl)) {
      seen.add(liveEl);
      liveEl.classList.remove('value-tick');
      // eslint-disable-next-line no-void
      void liveEl.offsetWidth;
      liveEl.classList.add('value-tick');
    }
  });
});
document.querySelectorAll('[data-live]').forEach((el) => {
  liveObserver.observe(el, { characterData: true, childList: true, subtree: true });
});

const THEME_KEY = 'baas-admin-theme';
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current =
      document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (e) {
      /* localStorage unavailable — theme choice just won't persist across reloads */
    }
  });
}
