const tbody = document.getElementById('keys-tbody');
const statusEl = document.getElementById('keys-status');
const createKeyBtn = document.getElementById('create-key-btn');
const createKeyForm = document.getElementById('create-key-form');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const newKeyName = document.getElementById('new-key-name');
const newKeyKind = document.getElementById('new-key-kind');
const secretBanner = document.getElementById('secret-banner');
const projectSelect = document.getElementById('project-select');

let currentProjectId = null;

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function showSecretBanner({ title, note, token }) {
  secretBanner.hidden = false;
  secretBanner.innerHTML = `
    <div>${escapeHtml(title)}</div>
    <p class="secret-banner-note">${escapeHtml(note)}</p>
    <div class="secret-banner-token-row">
      <code id="secret-banner-token">${escapeHtml(token)}</code>
      <button type="button" class="btn btn-outline btn-sm" data-copy-target="secret-banner-token">Copy</button>
    </div>
  `;
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return null;
  }
  return response;
}

function renderRow(key) {
  const tr = document.createElement('tr');
  const status = key.revokedAt ? `Revoked ${new Date(key.revokedAt).toLocaleString()}` : 'Active';
  const canView = key.kind === 'publishable' && !key.revokedAt;
  tr.innerHTML = `
    <td>${escapeHtml(key.name)}</td>
    <td><span class="badge kind-${escapeHtml(key.kind)}">${escapeHtml(key.kind)}</span></td>
    <td>${new Date(key.createdAt).toLocaleString()}</td>
    <td>${escapeHtml(key.createdBy)}</td>
    <td>${escapeHtml(status)}</td>
    <td class="actions-cell">
      ${canView ? '<button type="button" class="btn btn-outline btn-sm" data-action="view">View</button>' : ''}
      ${key.revokedAt ? '' : '<button type="button" class="btn btn-danger btn-sm" data-action="revoke">Revoke</button>'}
    </td>
  `;

  const viewBtn = tr.querySelector('[data-action="view"]');
  if (viewBtn) {
    viewBtn.addEventListener('click', async () => {
      const res = await apiFetch(`/admin/v1/api-keys/${key.id}/reveal`, { method: 'POST' });
      if (!res) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        statusEl.textContent = body.message ?? 'Failed to load key';
        return;
      }
      const { token } = await res.json();
      showSecretBanner({
        title: `"${key.name}" (publishable)`,
        note: 'This key can be viewed again anytime.',
        token,
      });
    });
  }

  const revokeBtn = tr.querySelector('[data-action="revoke"]');
  if (revokeBtn) {
    revokeBtn.addEventListener('click', async () => {
      if (!confirm(`Revoke API key "${key.name}"? Any client using it will immediately lose access.`)) {
        return;
      }
      const res = await apiFetch(`/admin/v1/api-keys/${key.id}/revoke`, { method: 'POST' });
      if (res?.ok) loadKeys();
    });
  }

  return tr;
}

async function loadKeys() {
  statusEl.textContent = 'Loading…';
  const res = await apiFetch(`/admin/v1/api-keys?projectId=${encodeURIComponent(currentProjectId)}`);
  if (!res) return;
  if (!res.ok) {
    statusEl.textContent = 'Failed to load API keys';
    return;
  }

  const { keys } = await res.json();
  tbody.innerHTML = '';
  for (const key of keys) {
    tbody.appendChild(renderRow(key));
  }
  statusEl.textContent = `${keys.length} key(s)`;
}

createKeyBtn.addEventListener('click', () => {
  createKeyForm.hidden = false;
});
cancelCreateBtn.addEventListener('click', () => {
  createKeyForm.hidden = true;
});

createKeyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newKeyName.value.trim();
  const kind = newKeyKind.value;
  if (!name) return;

  const res = await apiFetch('/admin/v1/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, kind, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    statusEl.textContent = body.message ?? 'Failed to create key';
    return;
  }

  const key = await res.json();
  showSecretBanner({
    title: `Created "${key.name}" (${key.kind})`,
    note:
      key.kind === 'publishable'
        ? 'You can view this key again anytime from the table below.'
        : 'Copy this token now — it will not be shown again.',
    token: key.token,
  });
  createKeyForm.hidden = true;
  newKeyName.value = '';
  loadKeys();
});

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  loadKeys();
});
