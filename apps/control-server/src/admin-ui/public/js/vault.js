const tbody = document.getElementById('secrets-tbody');
const statusEl = document.getElementById('vault-status');
const upsertForm = document.getElementById('upsert-secret-form');
const cancelUpsertBtn = document.getElementById('cancel-upsert-btn');
const secretNameInput = document.getElementById('secret-name');
const secretValueInput = document.getElementById('secret-value');
const projectSelect = document.getElementById('project-select');

let currentProjectId = null;

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

function renderRow(secret) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><code>${escapeHtml(secret.name)}</code></td>
    <td>${new Date(secret.updatedAt).toLocaleString()}</td>
    <td class="actions-cell">
      <button type="button" class="btn btn-outline btn-sm" data-action="rotate">${window.Icons.markup('edit')} Rotate</button>
      <button type="button" class="btn btn-danger btn-sm" data-action="delete">${window.Icons.markup('delete')} Delete</button>
    </td>
  `;

  tr.querySelector('[data-action="rotate"]').addEventListener('click', () => {
    secretNameInput.value = secret.name;
    secretValueInput.value = '';
    secretValueInput.focus();
  });

  tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (
      !confirm(
        `Delete secret "${secret.name}"? Any function reading it via ctx.secrets.get('${secret.name}') will get null afterward.`,
      )
    ) {
      return;
    }
    const res = await apiFetch(
      `/admin/v1/vault/${secret.id}?projectId=${encodeURIComponent(currentProjectId)}`,
      { method: 'DELETE' },
    );
    if (!res) return;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.message ?? 'Failed to delete secret', 'error');
      return;
    }
    showToast(`Secret "${secret.name}" deleted`, 'success');
    loadSecrets();
  });

  return tr;
}

async function loadSecrets() {
  statusEl.textContent = 'Loading…';
  const res = await apiFetch(`/admin/v1/vault?projectId=${encodeURIComponent(currentProjectId)}`);
  if (!res) return;
  if (!res.ok) {
    statusEl.textContent = 'Failed to load secrets';
    return;
  }

  const { secrets } = await res.json();
  tbody.innerHTML = '';
  for (const secret of secrets) {
    tbody.appendChild(renderRow(secret));
  }
  statusEl.textContent = `${secrets.length} secret(s)`;
}

cancelUpsertBtn.addEventListener('click', () => {
  upsertForm.reset();
});

upsertForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = secretNameInput.value.trim();
  const value = secretValueInput.value;
  if (!name || !value) return;

  const res = await apiFetch('/admin/v1/vault', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Failed to save secret', 'error');
    return;
  }
  const saved = await res.json();
  showToast(`Secret "${saved.name}" saved`, 'success');
  upsertForm.reset();
  loadSecrets();
});

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  upsertForm.reset();
  loadSecrets();
});
