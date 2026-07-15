const tbody = document.getElementById('users-tbody');
const statusEl = document.getElementById('users-status');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const createUserBtn = document.getElementById('create-user-btn');
const createUserForm = document.getElementById('create-user-form');
const cancelCreateBtn = document.getElementById('cancel-create-btn');
const newUserEmail = document.getElementById('new-user-email');
const newUserPassword = document.getElementById('new-user-password');
const secretBanner = document.getElementById('secret-banner');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');

const LIMIT = 25;
let offset = 0;
let total = 0;

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function showSecret(message) {
  secretBanner.hidden = false;
  secretBanner.textContent = message;
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
    <td>${escapeHtml(user.email)}</td>
    <td><span class="badge status-${escapeHtml(user.status)}">${escapeHtml(user.status)}</span></td>
    <td>${user.emailVerified ? 'Yes' : 'No'}</td>
    <td>${new Date(user.createdAt).toLocaleString()}</td>
    <td>${user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : '—'}</td>
    <td class="actions-cell">
      <button type="button" class="btn btn-outline btn-sm" data-action="status" data-status="${nextStatus}">${disableLabel}</button>
      <button type="button" class="btn btn-outline btn-sm" data-action="reset-token">Reset link</button>
      <button type="button" class="btn btn-outline btn-sm" data-action="temp-password">Temp password</button>
    </td>
  `;

  tr.querySelector('[data-action="status"]').addEventListener('click', async (e) => {
    const status = e.target.dataset.status;
    const res = await apiFetch(`/admin/v1/users/${user.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res?.ok) loadUsers();
  });

  tr.querySelector('[data-action="reset-token"]').addEventListener('click', async () => {
    const res = await apiFetch(`/admin/v1/users/${user.id}/reset-token`, { method: 'POST' });
    if (!res?.ok) return;
    const body = await res.json();
    showSecret(`Reset token for ${user.email} (expires ${new Date(body.expiresAt).toLocaleString()}): ${body.token}`);
  });

  tr.querySelector('[data-action="temp-password"]').addEventListener('click', async () => {
    const res = await apiFetch(`/admin/v1/users/${user.id}/temporary-password`, { method: 'POST' });
    if (!res?.ok) return;
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

createUserBtn.addEventListener('click', () => {
  createUserForm.hidden = false;
});
cancelCreateBtn.addEventListener('click', () => {
  createUserForm.hidden = true;
});

createUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = newUserEmail.value.trim();
  const password = newUserPassword.value.trim() || undefined;

  const res = await apiFetch('/admin/v1/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    statusEl.textContent = body.message ?? 'Failed to create user';
    return;
  }

  const body = await res.json();
  if (body.temporaryPassword) {
    showSecret(`Created ${body.user.email} — temporary password: ${body.temporaryPassword}`);
  }
  createUserForm.hidden = true;
  newUserEmail.value = '';
  newUserPassword.value = '';
  offset = 0;
  loadUsers();
});

loadUsers();
