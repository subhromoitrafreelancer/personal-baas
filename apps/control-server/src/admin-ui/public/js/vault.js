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
    const referencing = await referencingFunctions(secret.name);

    ConfirmModal.confirmDelete(`Delete secret "${secret.name}"?`, {
      bodyHtml: `<p>Any function calling <code>ctx.secrets.get('${escapeHtml(secret.name)}')</code> will get <code>null</code> afterward. This cannot be undone — there is no version history to recover the old value from.</p>`,
      warnings: [
        {
          label: `${referencing.length} function(s) in this project's source mention this name — verify before deleting, this is a text match, not a guarantee:`,
          items: referencing,
          formatter: (fn) => fn.name,
        },
      ],
      confirmLabel: 'Delete secret',
      onConfirm: async () => {
        const res = await apiFetch(
          `/admin/v1/vault/${secret.id}?projectId=${encodeURIComponent(currentProjectId)}`,
          { method: 'DELETE' },
        );
        if (!res) return { ok: false };
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, message: body.message ?? 'Failed to delete secret' };
        }
        showToast(`Secret "${secret.name}" deleted`, 'success');
        loadSecrets();
        return { ok: true };
      },
    });
  });

  return tr;
}

// Best-effort, non-blocking heads-up (mirrors the Database Explorer's function-reference scan
// for table delete, scope.md §29 point 4) — a simple text match against ctx.secrets.get('NAME')
// calls in this project's own function source, scoped to this project only (never reads or
// exposes another project's function code). Never blocks deletion: text matching can't tell a
// genuine reference from a coincidental string collision.
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function referencingFunctions(secretName) {
  const res = await apiFetch(
    `/admin/v1/functions?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res || !res.ok) return [];
  const { functions } = await res.json();
  const pattern = new RegExp(`ctx\\.secrets\\.get\\(\\s*['"]${escapeRegExp(secretName)}['"]`);
  return functions.filter((fn) => pattern.test(fn.code));
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
