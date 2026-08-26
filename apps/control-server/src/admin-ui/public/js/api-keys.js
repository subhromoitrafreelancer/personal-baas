const tbody = document.getElementById('keys-tbody');
const statusEl = document.getElementById('keys-status');
const generateEnvBtn = document.getElementById('generate-env-btn');
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

function hideSecretBanner() {
  secretBanner.hidden = true;
  secretBanner.innerHTML = '';
}

function showSecretBanner({ title, note, token }) {
  secretBanner.hidden = false;
  secretBanner.innerHTML = `
    <div class="secret-banner-header">
      <div>${escapeHtml(title)}</div>
      <button type="button" class="btn btn-icon secret-banner-close" aria-label="Dismiss" title="Dismiss">${window.Icons.markup('close')}</button>
    </div>
    <p class="secret-banner-note">${escapeHtml(note)}</p>
    <div class="secret-banner-token-row">
      <code id="secret-banner-token">${escapeHtml(token)}</code>
      <button type="button" class="btn btn-outline btn-sm" data-copy-target="secret-banner-token">${window.Icons.markup('copy')} Copy</button>
    </div>
  `;
  secretBanner.querySelector('.secret-banner-close').addEventListener('click', hideSecretBanner);
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
      ${canView ? `<button type="button" class="btn btn-outline btn-sm" data-action="view">${window.Icons.markup('view')} View</button>` : ''}
      ${key.revokedAt ? '' : `<button type="button" class="btn btn-danger btn-sm" data-action="revoke">${window.Icons.markup('delete')} Revoke</button>`}
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
        showToast(body.message ?? 'Failed to load key', 'error');
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
      if (!res) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.message ?? 'Failed to revoke key', 'error');
        return;
      }
      showToast(`Key "${key.name}" revoked`, 'success');
      loadKeys();
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

cancelCreateBtn.addEventListener('click', () => {
  createKeyForm.reset();
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
    showToast(body.message ?? 'Failed to create key', 'error');
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
  newKeyName.value = '';
  loadKeys();
});

generateEnvBtn.addEventListener('click', async () => {
  if (
    !confirm(
      'This mints a fresh secret key (existing keys are untouched) and downloads it as a .env file. Continue?',
    )
  ) {
    return;
  }
  generateEnvBtn.disabled = true;
  statusEl.textContent = 'Generating…';
  try {
    const res = await apiFetch('/admin/v1/api-keys/generate-env', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: currentProjectId }),
    });
    if (!res) return;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      statusEl.textContent = body.message ?? 'Failed to generate .env';
      showToast(body.message ?? 'Failed to generate .env', 'error');
      return;
    }

    const { projectSlug, publishableKey, serviceKey } = await res.json();
    const contents = [
      `BAAS_URL=${window.location.origin}`,
      `BAAS_PUBLISHABLE_KEY=${publishableKey}`,
      `BAAS_SERVICE_KEY=${serviceKey}`,
      '',
    ].join('\n');
    const blob = new Blob([contents], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectSlug}.env`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.textContent = 'Downloaded .env — the secret key inside it will not be shown again.';
    showToast('.env downloaded', 'success');
    loadKeys();
  } finally {
    generateEnvBtn.disabled = false;
  }
});

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  hideSecretBanner();
  loadKeys();
});
