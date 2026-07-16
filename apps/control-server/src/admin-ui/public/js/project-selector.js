// Shared by every admin page that scopes its data to a project (API Keys, Database, SQL
// Editor — Phase 9 PR7). Populates `selectEl` from /admin/v1/projects and calls
// `onChange(value, project)` once immediately and again on every selection change.
//
// options.optionValue: 'id' (default — for API calls that take a projectId) or 'schemaName'
//   (for pages that filter/target a schema directly, e.g. the DB explorer or SQL console).
// options.allLabel: if set, adds a leading "show everything" option (value '') and that
//   becomes the default selection instead of the seeded 'default' project — used by pages
//   (like the DB explorer) where filtering down to one project by default would hide schemas
//   an admin still wants to see (auth, platform, private, storage).
//
// `project` (the second onChange argument) is the full matching project row — undefined for
// the "show everything" option, if present — so a caller that needs more than just the
// schema/id (e.g. the SQL editor's snippet picker, which also needs anonRole/authenticatedRole/
// serviceRoleRole) doesn't need its own separate fetch. Existing single-argument callers are
// unaffected; they simply never look at the second argument.
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

  for (const project of projects) {
    const option = document.createElement('option');
    option.value = getOptionValue(project);
    option.textContent = `${project.name} (${project.slug})`;
    if (!opts.allLabel && project.slug === 'default') {
      option.selected = true;
    }
    selectEl.appendChild(option);
  }

  const findSelectedProject = () =>
    projects.find((project) => getOptionValue(project) === selectEl.value);

  selectEl.addEventListener('change', () => onChange(selectEl.value, findSelectedProject()));
  onChange(selectEl.value, findSelectedProject());
}
