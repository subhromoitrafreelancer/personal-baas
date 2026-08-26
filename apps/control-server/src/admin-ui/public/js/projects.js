const tbody = document.getElementById('projects-tbody');
const statusEl = document.getElementById('projects-status');
const createForm = document.getElementById('create-project-form');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const newSlug = document.getElementById('new-project-slug');
const newName = document.getElementById('new-project-name');
const restartBanner = document.getElementById('restart-banner');

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return null;
  }
  return response;
}

function showRestartBanner(restartCommand) {
  restartBanner.hidden = false;
  restartBanner.innerHTML = `
    <div>Project created. Run this to make it reachable through the REST API:</div>
    <div class="secret-banner-token-row">
      <code id="restart-command">${escapeHtml(restartCommand)}</code>
      <button type="button" class="btn btn-outline btn-sm" data-copy-target="restart-command">${window.Icons.markup('copy')} Copy</button>
    </div>
  `;
}

function renderRow(project) {
  const tr = document.createElement('tr');
  const isDefault = project.slug === 'default';
  const schema = encodeURIComponent(project.schemaName);
  tr.innerHTML = `
    <td>${escapeHtml(project.slug)} ${isDefault ? '<span class="default-project-badge">(seeded)</span>' : ''}</td>
    <td><a href="/admin/api?schema=${schema}" title="Open in API Explorer">${escapeHtml(project.name)}</a></td>
    <td><a href="/admin/database?schema=${schema}" title="Open in Database Explorer"><code>${escapeHtml(project.schemaName)}</code></a></td>
    <td><code>${escapeHtml(project.anonRole)}</code>, <code>${escapeHtml(project.authenticatedRole)}</code>, <code>${escapeHtml(project.serviceRoleRole)}</code></td>
    <td>${new Date(project.createdAt).toLocaleString()}</td>
  `;
  return tr;
}

async function loadProjects() {
  statusEl.textContent = 'Loading…';
  const res = await apiFetch('/admin/v1/projects');
  if (!res) return;
  if (!res.ok) {
    statusEl.textContent = 'Failed to load projects';
    return;
  }

  const { projects } = await res.json();
  tbody.innerHTML = '';
  for (const project of projects) {
    tbody.appendChild(renderRow(project));
  }
  statusEl.textContent = `${projects.length} project(s)`;
}

cancelCreateBtn.addEventListener('click', () => {
  createForm.reset();
});

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const slug = newSlug.value.trim();
  const name = newName.value.trim();
  if (!slug || !name) return;

  const res = await apiFetch('/admin/v1/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, name }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    statusEl.textContent = body.message ?? 'Failed to create project';
    showToast(body.message ?? 'Failed to create project', 'error');
    return;
  }

  const project = await res.json();
  showToast(`Project "${project.name}" created`, 'success');
  showRestartBanner(project.restartCommand);
  newSlug.value = '';
  newName.value = '';
  loadProjects();
});

loadProjects();
