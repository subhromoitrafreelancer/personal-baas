const tbody = document.getElementById('users-tbody');
const statusEl = document.getElementById('users-status');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const secretBanner = document.getElementById('secret-banner');
const showBulkCreateBtn = document.getElementById('show-bulk-create-btn');
const bulkCreateUserForm = document.getElementById('bulk-create-user-form');
const cancelBulkCreateBtn = document.getElementById('cancel-bulk-create-btn');
const bulkUserInput = document.getElementById('bulk-user-input');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const projectSelect = document.getElementById('project-select');
const filterEmail = document.getElementById('filter-email');
const filterStatus = document.getElementById('filter-status');
const filterMfa = document.getElementById('filter-mfa');

// Single shared row-actions menu (admin.css's .actions-menu) — one element, repositioned per
// click, rather than a dropdown built into every row (keeps the table itself compact and avoids
// clipping inside .table-wrap's overflow-x:auto).
const actionsMenu = document.createElement('div');
actionsMenu.className = 'actions-menu';
actionsMenu.hidden = true;
document.body.appendChild(actionsMenu);
let openActionsBtn = null;

function closeActionsMenu() {
  actionsMenu.hidden = true;
  actionsMenu.innerHTML = '';
  openActionsBtn = null;
}

function openActionsMenu(btn, items) {
  if (openActionsBtn === btn) {
    closeActionsMenu();
    return;
  }
  actionsMenu.innerHTML = items
    .map(
      (item, i) =>
        `<button type="button" data-index="${i}"${item.danger ? ' class="danger"' : ''}>${window.Icons.markup(item.icon, { size: 14 })} ${escapeHtml(item.label)}</button>`,
    )
    .join('');
  actionsMenu.querySelectorAll('button').forEach((el, i) => {
    el.addEventListener('click', () => {
      closeActionsMenu();
      items[i].onSelect();
    });
  });
  actionsMenu.hidden = false;
  openActionsBtn = btn;

  const rect = btn.getBoundingClientRect();
  const menuRect = actionsMenu.getBoundingClientRect();
  let top = rect.bottom + 4;
  if (top + menuRect.height > window.innerHeight) {
    top = rect.top - menuRect.height - 4;
  }
  let left = rect.right - menuRect.width;
  left = Math.max(8, Math.min(left, window.innerWidth - menuRect.width - 8));
  actionsMenu.style.top = `${top}px`;
  actionsMenu.style.left = `${left}px`;
}

document.addEventListener('click', (e) => {
  if (!actionsMenu.hidden && !actionsMenu.contains(e.target) && e.target !== openActionsBtn) {
    closeActionsMenu();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeActionsMenu();
});
window.addEventListener('scroll', closeActionsMenu, true);
window.addEventListener('resize', closeActionsMenu);

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

// `message` is either a single line (reset-token/temp-password/MFA-reset callers) or an array
// of lines (bulk create, one per successfully-created user).
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

async function setStatus(user, status) {
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
}

async function resetToken(user) {
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
}

async function tempPassword(user) {
  const res = await apiFetch(`/admin/v1/users/${user.id}/temporary-password`, { method: 'POST' });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Failed to set temporary password', 'error');
    return;
  }
  const body = await res.json();
  showSecret(`Temporary password for ${user.email}: ${body.temporaryPassword}`);
}

async function resetMfa(user) {
  if (!window.confirm(`Reset MFA for ${user.email}? They will need to re-enroll.`)) return;
  const res = await apiFetch(`/admin/v1/users/${user.id}/mfa`, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Failed to reset MFA', 'error');
    return;
  }
  showToast(`MFA reset for ${user.email}`, 'success');
  loadUsers();
}

function renderRow(user) {
  const tr = document.createElement('tr');
  tr.dataset.email = user.email.toLowerCase();
  tr.dataset.status = user.status;
  tr.dataset.mfa = user.mfaEnabled ? 'enabled' : 'disabled';
  const disableLabel = user.status === 'disabled' ? 'Enable' : 'Disable';
  const nextStatus = user.status === 'disabled' ? 'active' : 'disabled';
  tr.innerHTML = `
    <td>
      <div class="identity-cell">
        <span class="copyable-cell">
          ${escapeHtml(user.email)}
          <button type="button" class="copy-btn" data-copy-value="${escapeHtml(user.email)}" aria-label="Copy email" title="Copy email">${window.Icons.markup('copy')}</button>
        </span>
        <span class="copyable-cell identity-id">
          ${escapeHtml(user.id)}
          <button type="button" class="copy-btn" data-copy-value="${escapeHtml(user.id)}" aria-label="Copy ID" title="Copy ID">${window.Icons.markup('copy')}</button>
        </span>
      </div>
    </td>
    <td><span class="badge status-${escapeHtml(user.status)}">${escapeHtml(user.status)}</span></td>
    <td>${user.emailVerified ? 'Yes' : 'No'}</td>
    <td><span class="badge ${user.mfaEnabled ? 'status-active' : 'status-disabled'}">${user.mfaEnabled ? 'Enabled' : 'Disabled'}</span></td>
    <td>${new Date(user.createdAt).toLocaleString()}</td>
    <td>${user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : '—'}</td>
    <td class="actions-cell">
      <button type="button" class="btn btn-outline btn-icon btn-sm" data-action="menu" aria-label="Actions for ${escapeHtml(user.email)}" title="Actions">${window.Icons.markup('more')}</button>
    </td>
  `;

  tr.querySelector('[data-action="menu"]').addEventListener('click', (e) => {
    e.stopPropagation();
    const items = [
      {
        icon: disableLabel === 'Enable' ? 'check' : 'close',
        label: disableLabel,
        onSelect: () => setStatus(user, nextStatus),
      },
      { icon: 'external-link', label: 'Reset link', onSelect: () => resetToken(user) },
      { icon: 'view', label: 'Temp password', onSelect: () => tempPassword(user) },
    ];
    if (user.mfaEnabled) {
      items.push({
        icon: 'warning',
        label: 'Reset MFA',
        danger: true,
        onSelect: () => resetMfa(user),
      });
    }
    openActionsMenu(e.currentTarget, items);
  });

  return tr;
}

function applyFilters() {
  const email = filterEmail.value.trim().toLowerCase();
  const status = filterStatus.value;
  const mfa = filterMfa.value;
  tbody.querySelectorAll('tr').forEach((tr) => {
    const matches =
      (!email || tr.dataset.email.includes(email)) &&
      (!status || tr.dataset.status === status) &&
      (!mfa || tr.dataset.mfa === mfa);
    tr.hidden = !matches;
  });
}

filterEmail.addEventListener('input', applyFilters);
filterStatus.addEventListener('change', applyFilters);
filterMfa.addEventListener('change', applyFilters);

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
  applyFilters();
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

// "Add users" is a real toggle: click again while the form is open to close it. Cancel is a
// distinct explicit close that also discards whatever was typed.
showBulkCreateBtn.addEventListener('click', () => {
  const opening = bulkCreateUserForm.hidden;
  bulkCreateUserForm.hidden = !opening;
  if (opening) bulkUserInput.focus();
});

cancelBulkCreateBtn.addEventListener('click', () => {
  bulkCreateUserForm.reset();
  bulkCreateUserForm.hidden = true;
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
  offset = 0;
  loadUsers();
});

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  offset = 0;
  hideSecret();
  loadUsers();
});
