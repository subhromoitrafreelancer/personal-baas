// Shared by every admin page that scopes its data to a project (API Keys, Database, SQL
// Editor — Phase 9 PR7). Populates `selectEl` from /admin/v1/projects and calls
// `onChange(value, project)` once immediately and again on every selection change.
//
// options.optionValue: 'id' (default — for API calls that take a projectId) or 'schemaName'
//   (for pages that filter/target a schema directly, e.g. the DB explorer or SQL console).
// options.allLabel: if set, adds a leading "show everything" option (value ''). It is available
//   in the dropdown but is NOT the default selection (Phase 14 — filtering to one project by
//   default, not an unfiltered "everything" view an admin then has to scroll through, is the
//   whole point of the selector); the seeded 'default' project still wins the initial pick, same
//   as pages without allLabel. Pick "show everything" explicitly when you actually want it.
// options.initialValue: if set (Phase 14 cross-link support, e.g. a `?schema=` query param from
//   the Projects page), that option is pre-selected instead of the 'default'-project fallback
//   or a persisted last-selected project (below) — an explicit deep link always wins.
//
// `project` (the second onChange argument) is the full matching project row — undefined for
// the "show everything" option, if present — so a caller that needs more than just the
// schema/id (e.g. the SQL editor's snippet picker, which also needs anonRole/authenticatedRole/
// serviceRoleRole) doesn't need its own separate fetch. Existing single-argument callers are
// unaffected; they simply never look at the second argument.
//
// Persistence (critique 2026-09-09 P1): every project-scoped page independently defaulted back
// to 'default' on load, forcing a re-pick on every single-page navigation — actively working
// against multi-project isolation, this platform's own headline feature. The last real project
// selection (by slug, the one identifier stable across every optionValue mode) is remembered in
// localStorage and preferred over the 'default' fallback, but never over an explicit
// options.initialValue deep link, and never for the "show everything" pseudo-option — picking
// "show everything" stays a deliberate, per-visit choice (Phase 14's own reasoning, preserved
// here), not something that should silently become every other page's default too.
const LAST_PROJECT_SLUG_KEY = 'baas-admin-last-project-slug';

function readLastProjectSlug() {
  try {
    return window.localStorage.getItem(LAST_PROJECT_SLUG_KEY);
  } catch {
    return null;
  }
}

function writeLastProjectSlug(slug) {
  try {
    window.localStorage.setItem(LAST_PROJECT_SLUG_KEY, slug);
  } catch {
    // Private browsing / blocked storage — persistence is a convenience, never a hard
    // requirement, so a write failure here must not break project selection itself.
  }
}

async function initProjectSelector(selectEl, onChange, options) {
  const opts = options || {};
  const res = await fetch('/admin/v1/projects');
  if (res.status === 401) {
    window.location.href = '/admin/login';
    return;
  }
  const { projects } = await res.json();

  selectEl.innerHTML = '';

  const getOptionValue = (project) =>
    opts.optionValue === 'schemaName' ? project.schemaName : project.id;

  if (opts.allLabel) {
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = opts.allLabel;
    selectEl.appendChild(allOption);
  }

  // Only trust a stored slug that still names a real project — a stale value (e.g. from a
  // since-deleted project) must fall through to the ordinary 'default' fallback below, not
  // silently leave nothing selected.
  const lastSlug = opts.initialValue ? null : readLastProjectSlug();
  const lastSlugExists = lastSlug !== null && projects.some((project) => project.slug === lastSlug);

  for (const project of projects) {
    const option = document.createElement('option');
    option.value = getOptionValue(project);
    option.textContent = `${project.name} (${project.slug})`;
    if (opts.initialValue) {
      option.selected = option.value === opts.initialValue;
    } else if (lastSlugExists) {
      option.selected = project.slug === lastSlug;
    } else if (project.slug === 'default') {
      option.selected = true;
    }
    selectEl.appendChild(option);
  }

  const findSelectedProject = () =>
    projects.find((project) => getOptionValue(project) === selectEl.value);

  const persistSelection = () => {
    const selected = findSelectedProject();
    if (selected) writeLastProjectSlug(selected.slug);
  };

  selectEl.addEventListener('change', () => {
    persistSelection();
    onChange(selectEl.value, findSelectedProject());
  });
  persistSelection();
  onChange(selectEl.value, findSelectedProject());
}
