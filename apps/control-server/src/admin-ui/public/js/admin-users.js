const tbody = document.getElementById('users-tbody');
const statusEl = document.getElementById('users-status');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const createUserForm = document.getElementById('create-user-form');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const newUserEmail = document.getElementById('new-user-email');
const newUserPassword = document.getElementById('new-user-password');
const secretBanner = document.getElementById('secret-banner');
const showBulkCreateBtn = document.getElementById('show-bulk-create-btn');
const bulkCreateUserForm = document.getElementById('bulk-create-user-form');
const cancelBulkCreateBtn = document.getElementById('cancel-bulk-create-btn');
const bulkUserInput = document.getElementById('bulk-user-input');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const projectSelect = document.getElementById('project-select');

const LIMIT = 25;
let offset = 0;
let total = 0;
let currentProjectId = null;

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function hideSecret() {
  secretBanner.hidden = true;
  secretBanner.innerHTML = '';
}

// `message` is either a single line (existing single-user create/reset-token/temp-password
// callers) or an array of lines (bulk create, one per successfully-created user).
function showSecret(message) {
  const lines = Array.isArray(message) ? message : [message];
  secretBanner.hidden = false;
  secretBanner.innerHTML = `
    <div class="secret-banner-header">
      ${lines.length === 1 ? `<span>${escapeHtml(lines[0])}</span>` : `<ul class="secret-banner-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`}
      <button type="button" class="btn btn-icon secret-banner-close" aria-label="Dismiss" title="Dismiss">${window.Icons.markup('close')}</button>
    </div>
  `;
  secretBanner.querySelector('.secret-banner-close').addEventListener('click', hideSecret);
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return null;
  }
  return response;
}

function renderRow(user) {
  const tr = document.createElement('tr');
  const disableLabel = user.status === 'disabled' ? 'Enable' : 'Disable';
  const nextStatus = user.status === 'disabled' ? 'active' : 'disabled';
  tr.innerHTML = `
    <td>
      <span class="copyable-cell">
        ${escapeHtml(user.id)}
        <button type="button" class="copy-btn" data-copy-value="${escapeHtml(user.id)}" aria-label="Copy" title="Copy">${window.Icons.markup('copy')}</button>
      </span>
    </td>
    <td>
      <span class="copyable-cell">
        ${escapeHtml(user.email)}
        <button type="button" class="copy-btn" data-copy-value="${escapeHtml(user.email)}" aria-label="Copy" title="Copy">${window.Icons.markup('copy')}</button>
      </span>
    </td>
    <td><span class="badge status-${escapeHtml(user.status)}">${escapeHtml(user.status)}</span></td>
    <td>${user.emailVerified ? 'Yes' : 'No'}</td>
    <td>${new Date(user.createdAt).toLocaleString()}</td>
    <td>${user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : '—'}</td>
    <td class="actions-cell">
      <button type="button" class="btn btn-outline btn-sm" data-action="status" data-status="${nextStatus}">${disableLabel}</button>
      <button type="button" class="btn btn-outline btn-sm" data-action="reset-token">${window.Icons.markup('external-link')} Reset link</button>
      <button type="button" class="btn btn-outline btn-sm" data-action="temp-password">${window.Icons.markup('view')} Temp password</button>
    </td>
  `;

  tr.querySelector('[data-action="status"]').addEventListener('click', async (e) => {
    const status = e.target.dataset.status;
    const res = await apiFetch(`/admin/v1/users/${user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res) return;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.message ?? 'Failed to update status', 'error');
      return;
    }
    showToast(`${user.email} ${status === 'disabled' ? 'disabled' : 'enabled'}`, 'success');
    loadUsers();
  });

  tr.querySelector('[data-action="reset-token"]').addEventListener('click', async () => {
    const res = await apiFetch(`/admin/v1/users/${user.id}/reset-token`, { method: 'POST' });
    if (!res) return;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.message ?? 'Failed to generate reset token', 'error');
      return;
    }
    const body = await res.json();
    showSecret(
      `Reset token for ${user.email} (expires ${new Date(body.expiresAt).toLocaleString()}): ${body.token}`,
    );
  });

  tr.querySelector('[data-action="temp-password"]').addEventListener('click', async () => {
    const res = await apiFetch(`/admin/v1/users/${user.id}/temporary-password`, { method: 'POST' });
    if (!res) return;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(body.message ?? 'Failed to set temporary password', 'error');
      return;
    }
    const body = await res.json();
    showSecret(`Temporary password for ${user.email}: ${body.temporaryPassword}`);
  });

  return tr;
}

async function loadUsers() {
  statusEl.textContent = 'Loading…';
  const search = searchInput.value.trim();
  const params = new URLSearchParams({ limit: LIMIT, offset });
  if (search) params.set('search', search);
  if (currentProjectId) params.set('projectId', currentProjectId);

  const res = await apiFetch(`/admin/v1/users?${params}`);
  if (!res) return;
  if (!res.ok) {
    statusEl.textContent = 'Failed to load users';
    return;
  }

  const body = await res.json();
  total = body.total;
  tbody.innerHTML = '';
  for (const user of body.users) {
    tbody.appendChild(renderRow(user));
  }
  statusEl.textContent = `${total} user(s)`;
  pageInfo.textContent = `${total === 0 ? 0 : offset + 1}–${Math.min(offset + LIMIT, total)} of ${total}`;
  prevPageBtn.disabled = offset === 0;
  nextPageBtn.disabled = offset + LIMIT >= total;
}

searchBtn.addEventListener('click', () => {
  offset = 0;
  loadUsers();
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    offset = 0;
    loadUsers();
  }
});

prevPageBtn.addEventListener('click', () => {
  offset = Math.max(0, offset - LIMIT);
  loadUsers();
});
nextPageBtn.addEventListener('click', () => {
  offset += LIMIT;
  loadUsers();
});

cancelCreateBtn.addEventListener('click', () => {
  createUserForm.reset();
});

createUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = newUserEmail.value.trim();
  const password = newUserPassword.value.trim() || undefined;

  const res = await apiFetch('/admin/v1/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    statusEl.textContent = body.message ?? 'Failed to create user';
    showToast(body.message ?? 'Failed to create user', 'error');
    return;
  }

  const body = await res.json();
  showToast(`User "${body.user.email}" created`, 'success');
  if (body.temporaryPassword) {
    showSecret(`Created ${body.user.email} — temporary password: ${body.temporaryPassword}`);
  }
  newUserEmail.value = '';
  newUserPassword.value = '';
  offset = 0;
  loadUsers();
});

showBulkCreateBtn.addEventListener('click', () => {
  createUserForm.hidden = true;
  bulkCreateUserForm.hidden = false;
  bulkUserInput.focus();
});

cancelBulkCreateBtn.addEventListener('click', () => {
  bulkCreateUserForm.reset();
  bulkCreateUserForm.hidden = true;
  createUserForm.hidden = false;
});

bulkCreateUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const entries = bulkUserInput.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const commaIndex = line.indexOf(',');
      if (commaIndex === -1) return { email: line.trim() };
      return {
        email: line.slice(0, commaIndex).trim(),
        password: line.slice(commaIndex + 1).trim() || undefined,
      };
    });
  if (entries.length === 0) return;

  const res = await apiFetch('/admin/v1/users/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ users: entries, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Bulk create failed', 'error');
    return;
  }

  const { results, summary } = await res.json();
  showToast(
    `${summary.created} created, ${summary.skipped} skipped, ${summary.failed} failed`,
    summary.failed > 0 ? 'error' : 'success',
  );

  const secretLines = results
    .filter((r) => r.status === 'created' && r.temporaryPassword)
    .map((r) => `${r.email} — temporary password: ${r.temporaryPassword}`);
  const problemLines = results
    .filter((r) => r.status !== 'created')
    .map((r) => `${r.email} — ${r.status}${r.message ? `: ${r.message}` : ''}`);
  const lines = [...secretLines, ...problemLines];
  if (lines.length > 0) showSecret(lines);

  bulkCreateUserForm.reset();
  bulkCreateUserForm.hidden = true;
  createUserForm.hidden = false;
  offset = 0;
  loadUsers();
});

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  offset = 0;
  hideSecret();
  loadUsers();
});
