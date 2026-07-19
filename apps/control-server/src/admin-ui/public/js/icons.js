// Shared icon set for the admin console (Phase 14, scope.md §28 point 2). Plain classic script
// (not a module) so it always executes before any `type="module"` page script, guaranteeing
// `window.Icons` exists by the time page-specific JS builds icon markup into template strings.
// No external icon font/library/CDN — self-hosted geometric shapes, same "vendor it, never load
// a third-party script tag" posture as the CodeMirror bundle.
const ICONS = {
  copy: '<rect x="4" y="4" width="12" height="12" rx="2"></rect><rect x="8" y="8" width="12" height="12" rx="2"></rect>',
  check: '<polyline points="4,12 9,17 20,6"></polyline>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path>',
  delete: '<polyline points="4,7 20,7"></polyline><path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"></path><path d="M9 7V4h6v3"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
  save: '<path d="M5 4h11l3 3v13H5z"></path><rect x="8" y="4" width="7" height="5"></rect><rect x="7" y="14" width="10" height="6"></rect>',
  add: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
  close: '<line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line>',
  view: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle>',
  upload: '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5,12 12,5 19,12"></polyline><line x1="4" y1="21" x2="20" y2="21"></line>',
  download: '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="5,12 12,19 19,12"></polyline><line x1="4" y1="21" x2="20" y2="21"></line>',
  refresh: '<path d="M4 12a8 8 0 0 1 14-5.3L20 8"></path><polyline points="20,3 20,8 15,8"></polyline><path d="M20 12a8 8 0 0 1-14 5.3L4 16"></path><polyline points="4,21 4,16 9,16"></polyline>',
  chevron: '<polyline points="6,9 12,15 18,9"></polyline>',
  'external-link': '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15,3 21,3 21,9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>',
  search: '<circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
  run: '<polygon points="6,4 20,12 6,20"></polygon>',
  history: '<circle cx="12" cy="12" r="9"></circle><polyline points="12,7 12,12 16,14"></polyline>',
  warning: '<path d="M12 3l10 18H2z"></path><line x1="12" y1="9" x2="12" y2="14"></line><circle cx="12" cy="17.3" r="0.6" fill="currentColor" stroke="none"></circle>',
};

function iconMarkup(name, opts) {
  const inner = ICONS[name];
  if (!inner) return '';
  const size = (opts && opts.size) || 16;
  return (
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${inner}</svg>`
  );
}

// Static hbs buttons mark themselves with data-icon="<name>" and keep their visible label text —
// this hydrates the icon in front of that text without every page needing its own wiring code.
function applyIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconApplied) return;
    el.insertAdjacentHTML('afterbegin', iconMarkup(el.dataset.icon));
    el.dataset.iconApplied = 'true';
  });
}

window.Icons = { markup: iconMarkup, apply: applyIcons };
applyIcons(document);
