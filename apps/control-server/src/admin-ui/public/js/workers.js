const tbody = document.getElementById('integrations-tbody');
const statusEl = document.getElementById('workers-status');
const registerBtn = document.getElementById('register-btn');
const disabledState = document.getElementById('disabled-state');
const listSection = document.getElementById('list-section');
const secretBanner = document.getElementById('secret-banner');
const detailSection = document.getElementById('detail-section');
const grantsTbody = document.getElementById('grants-tbody');
const leasesTbody = document.getElementById('leases-tbody');

const SECRET_NAME = /^[A-Z][A-Z0-9_]{0,199}$/;
const BASE = '/admin/v1/worker-integrations';

let selectedId = null;
let detail = null;

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

async function post(url, body) {
  const res = await apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res) return { ok: false };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, message: data.message ?? 'Request failed' };
  return { ok: true, data };
}

const fmt = (value) => (value ? new Date(value).toLocaleString() : '—');
const statusBadge = (enabled) =>
  `<span class="badge ${enabled ? 'status-active' : 'status-disabled'}">${enabled ? 'enabled' : 'disabled'}</span>`;

function hideSecretBanner() {
  secretBanner.hidden = true;
  secretBanner.innerHTML = '';
}

// The machine credential is only ever shown here, once, straight from the create/rotate
// response. It is never part of a list/detail payload (the server stores only its hash).
function showCredentialBanner(title, credential) {
  secretBanner.hidden = false;
  secretBanner.innerHTML = `
    <div class="secret-banner-header">
      <div>${escapeHtml(title)}</div>
      <button type="button" class="btn btn-icon secret-banner-close" aria-label="Dismiss" title="Dismiss">${window.Icons.markup('close')}</button>
    </div>
    <p class="secret-banner-note">Copy this machine credential into the worker's secret store now — it will not be shown again. Dismissing this banner discards it.</p>
    <div class="secret-banner-token-row">
      <code id="secret-banner-token">${escapeHtml(credential)}</code>
      <button type="button" class="btn btn-outline btn-sm" data-copy-target="secret-banner-token">${window.Icons.markup('copy')} Copy</button>
    </div>
  `;
  secretBanner.querySelector('.secret-banner-close').addEventListener('click', hideSecretBanner);
}

function renderListRow(item) {
  const tr = document.createElement('tr');
  if (item.id === selectedId) tr.classList.add('row-selected');
  tr.innerHTML = `
    <td>${escapeHtml(item.name)}</td>
    <td>${statusBadge(item.enabled)}</td>
    <td>${item.enabled_grants}</td>
    <td>${item.active_leases}</td>
    <td>${fmt(item.last_lease_activity)}</td>
    <td>${fmt(item.created_at)}</td>
    <td class="actions-cell">
      <button type="button" class="btn btn-outline btn-sm" data-action="open">${window.Icons.markup('view')} Open</button>
    </td>
  `;
  tr.querySelector('[data-action="open"]').addEventListener('click', () => openDetail(item.id));
  return tr;
}

async function loadList() {
  statusEl.textContent = 'Loading…';
  const res = await apiFetch(BASE);
  if (!res) return;
  if (!res.ok) {
    statusEl.textContent = 'Failed to load integrations';
    return;
  }
  const { featureEnabled, integrations } = await res.json();
  disabledState.hidden = featureEnabled;
  listSection.hidden = !featureEnabled;
  registerBtn.disabled = !featureEnabled;
  if (!featureEnabled) {
    detailSection.hidden = true;
    statusEl.textContent = 'Feature disabled';
    return;
  }
  tbody.innerHTML = '';
  for (const item of integrations) tbody.appendChild(renderListRow(item));
  statusEl.textContent = `${integrations.length} integration(s)`;
}

async function openDetail(id) {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}`);
  if (!res) return;
  if (!res.ok) {
    showToast('Failed to load integration', 'error');
    return;
  }
  selectedId = id;
  detail = await res.json();
  renderDetail();
  loadList();
  detailSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeDetail() {
  selectedId = null;
  detail = null;
  detailSection.hidden = true;
  loadList();
}

async function refreshDetail() {
  if (selectedId) await openDetailQuiet(selectedId);
  loadList();
}

async function openDetailQuiet(id) {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(id)}`);
  if (!res || !res.ok) {
    closeDetail();
    return;
  }
  detail = await res.json();
  renderDetail();
}

function renderDetail() {
  detailSection.hidden = false;
  document.getElementById('detail-name').textContent = detail.name;
  document.getElementById('detail-id').textContent = detail.id;
  const badge = document.getElementById('detail-status');
  badge.textContent = detail.enabled ? 'enabled' : 'disabled';
  badge.className = `badge ${detail.enabled ? 'status-active' : 'status-disabled'}`;
  const toggle = document.getElementById('toggle-btn');
  toggle.textContent = detail.enabled ? 'Disable' : 'Re-enable';
  toggle.className = detail.enabled ? 'btn btn-danger btn-sm' : 'btn btn-outline btn-sm';

  grantsTbody.innerHTML = '';
  for (const grant of detail.grants) grantsTbody.appendChild(renderGrantRow(grant));
  if (detail.grants.length === 0) {
    grantsTbody.innerHTML = '<tr><td colspan="5">No project grants yet.</td></tr>';
  }

  leasesTbody.innerHTML = '';
  for (const lease of detail.leases) leasesTbody.appendChild(renderLeaseRow(lease));
  if (detail.leases.length === 0) {
    leasesTbody.innerHTML = '<tr><td colspan="9">No leases issued yet.</td></tr>';
  }
}

function renderGrantRow(grant) {
  const tr = document.createElement('tr');
  const chips = grant.allowed_secret_names.length
    ? grant.allowed_secret_names.map((n) => `<span class="chip">${escapeHtml(n)}</span>`).join('')
    : '<span class="hint">none</span>';
  tr.innerHTML = `
    <td>${escapeHtml(grant.project_name)} <code>${escapeHtml(grant.project_slug)}</code></td>
    <td>${chips}</td>
    <td>${statusBadge(grant.enabled)}</td>
    <td>${fmt(grant.updated_at)}</td>
    <td class="actions-cell">
      <button type="button" class="btn btn-outline btn-sm" data-action="edit">${window.Icons.markup('edit')} Edit</button>
      <button type="button" class="btn ${grant.enabled ? 'btn-danger' : 'btn-outline'} btn-sm" data-action="toggle">${grant.enabled ? 'Disable' : 'Enable'}</button>
    </td>
  `;
  tr.querySelector('[data-action="edit"]').addEventListener('click', () => openGrantEditor(grant));
  tr.querySelector('[data-action="toggle"]').addEventListener('click', () => {
    const apply = () => saveGrant(grant.project_id, grant.allowed_secret_names, !grant.enabled);
    if (!grant.enabled) {
      apply().then(
        (r) => r.ok && showToast('Grant enabled — the worker must obtain a new lease', 'success'),
      );
      return;
    }
    ConfirmModal.confirmDelete(`Disable grant for "${grant.project_slug}"?`, {
      bodyHtml:
        '<p>All API keys already issued to this worker for the project are revoked immediately and new leases, renewals and vault reads are refused. Re-enabling later requires the worker to obtain a new lease.</p>',
      confirmLabel: 'Disable grant',
      onConfirm: () => apply(),
    });
  });
  return tr;
}

function leaseStateBadge(state) {
  const cls = state === 'active' ? 'status-active' : 'status-disabled';
  return `<span class="badge ${cls}">${escapeHtml(state)}</span>`;
}

function renderLeaseRow(lease) {
  const tr = document.createElement('tr');
  const revoked = lease.revoked_at ?? lease.key_revoked_at;
  tr.innerHTML = `
    <td><code>${escapeHtml(lease.id)}</code></td>
    <td><code>${escapeHtml(lease.project_slug)}</code></td>
    <td><code>${escapeHtml(lease.api_key_id)}</code></td>
    <td>${leaseStateBadge(lease.state)}</td>
    <td>${fmt(lease.issued_at)}</td>
    <td>${fmt(lease.last_renewed_at)}</td>
    <td>${fmt(lease.expires_at)}</td>
    <td>${fmt(revoked)}</td>
    <td class="actions-cell">${
      lease.state === 'revoked'
        ? ''
        : `<button type="button" class="btn btn-danger btn-sm" data-action="revoke">${window.Icons.markup('delete')} Revoke</button>`
    }</td>
  `;
  const btn = tr.querySelector('[data-action="revoke"]');
  if (btn) {
    btn.addEventListener('click', () => {
      ConfirmModal.confirmDelete('Revoke lease?', {
        bodyHtml:
          '<p>The API key behind this lease stops working immediately. The worker can obtain a new lease while its grant is enabled.</p>',
        confirmLabel: 'Revoke lease',
        onConfirm: async () => {
          const r = await post(`${BASE}/${detail.id}/leases/${lease.id}/revoke`);
          if (!r.ok) return r;
          showToast('Lease revoked', 'success');
          refreshDetail();
          return { ok: true };
        },
      });
    });
  }
  return tr;
}

async function saveGrant(projectId, names, enabled) {
  const r = await post(`${BASE}/${detail.id}/grants`, {
    project_id: projectId,
    allowed_secret_names: names,
    enabled,
  });
  if (r.ok) refreshDetail();
  else showToast(r.message, 'error');
  return r;
}

async function openGrantEditor(existing) {
  const projectsRes = await apiFetch('/admin/v1/projects');
  if (!projectsRes || !projectsRes.ok) {
    showToast('Failed to load projects', 'error');
    return;
  }
  const { projects } = await projectsRes.json();
  const takenIds = new Set(detail.grants.map((g) => g.project_id));
  const choices = existing ? projects.filter((p) => p.id === existing.project_id) : projects;
  if (choices.length === 0) {
    showToast('No projects available', 'error');
    return;
  }

  ConfirmModal.open(existing ? 'Edit grant' : 'Add grant');
  const body = ConfirmModal.body;
  body.innerHTML = `
    <p class="banner banner-warning">This grant gives the worker the project's service-role data access, including RLS bypass. The secret list restricts vault reads only.</p>
    <div class="field">
      <label for="grant-project">Project</label>
      <select id="grant-project">${choices
        .map(
          (p) =>
            `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} (${escapeHtml(p.slug)})${!existing && takenIds.has(p.id) ? ' — already granted, will update' : ''}</option>`,
        )
        .join('')}</select>
    </div>
    <div class="field">
      <label>Allowed vault secrets</label>
      <div id="grant-secrets" class="secret-picker"></div>
      <label for="grant-extra">Other names (comma separated, UPPER_SNAKE_CASE)</label>
      <input id="grant-extra" type="text" autocomplete="off" placeholder="e.g. PROVIDER_API_TOKEN" />
    </div>
    <label class="field"><input id="grant-enabled" type="checkbox" ${existing && !existing.enabled ? '' : 'checked'} /> Enabled</label>
  `;

  const projectSel = document.getElementById('grant-project');
  const picker = document.getElementById('grant-secrets');
  const extra = document.getElementById('grant-extra');
  if (existing) projectSel.disabled = true;

  async function loadSecrets() {
    const pid = projectSel.value;
    const current =
      existing && existing.project_id === pid
        ? existing.allowed_secret_names
        : (detail.grants.find((g) => g.project_id === pid)?.allowed_secret_names ?? []);
    const res = await apiFetch(`/admin/v1/vault?projectId=${encodeURIComponent(pid)}`);
    const known = res && res.ok ? (await res.json()).secrets.map((s) => s.name) : [];
    picker.innerHTML = known.length
      ? known
          .map(
            (n) =>
              `<label><input type="checkbox" value="${escapeHtml(n)}" ${current.includes(n) ? 'checked' : ''} /> <code>${escapeHtml(n)}</code></label>`,
          )
          .join('')
      : '<span class="hint">No vault secrets in this project yet.</span>';
    extra.value = current.filter((n) => !known.includes(n)).join(', ');
  }
  projectSel.addEventListener('change', loadSecrets);
  loadSecrets();

  const footer = ConfirmModal.footer;
  const cancel = ConfirmModal.footerButton('Cancel', 'btn btn-outline');
  cancel.addEventListener('click', ConfirmModal.close);
  const save = ConfirmModal.footerButton('Save grant', 'btn btn-primary');
  footer.appendChild(cancel);
  footer.appendChild(save);
  save.addEventListener('click', async () => {
    const names = [...picker.querySelectorAll('input[type="checkbox"]:checked')].map(
      (i) => i.value,
    );
    for (const n of extra.value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)) {
      if (!names.includes(n)) names.push(n);
    }
    const bad = names.find((n) => !SECRET_NAME.test(n));
    if (bad) {
      showToast(`Invalid secret name "${bad}" — use UPPER_SNAKE_CASE`, 'error');
      return;
    }
    if (names.length > 100) {
      showToast('At most 100 secret names', 'error');
      return;
    }
    save.disabled = true;
    const r = await saveGrant(
      projectSel.value,
      names,
      document.getElementById('grant-enabled').checked,
    );
    if (r.ok) {
      ConfirmModal.close();
      showToast('Grant saved', 'success');
    } else {
      save.disabled = false;
    }
  });
}

registerBtn.addEventListener('click', () => {
  ConfirmModal.open('Register integration');
  ConfirmModal.body.innerHTML = `
    <div class="field">
      <label for="reg-name">Name</label>
      <input id="reg-name" type="text" maxlength="100" required placeholder="e.g. background-engine" autocomplete="off" />
    </div>
    <p class="hint">A machine credential is generated for you and shown once after registration. Only its hash is stored.</p>
  `;
  const input = document.getElementById('reg-name');
  input.focus();
  const cancel = ConfirmModal.footerButton('Cancel', 'btn btn-outline');
  cancel.addEventListener('click', ConfirmModal.close);
  const create = ConfirmModal.footerButton('Register', 'btn btn-primary');
  ConfirmModal.footer.appendChild(cancel);
  ConfirmModal.footer.appendChild(create);
  create.addEventListener('click', async () => {
    const name = input.value.trim();
    if (!name) return;
    create.disabled = true;
    const r = await post(BASE, { name });
    if (!r.ok) {
      showToast(r.message, 'error');
      create.disabled = false;
      return;
    }
    ConfirmModal.close();
    showCredentialBanner(`Registered "${r.data.name}"`, r.data.credential);
    showToast(`Integration "${r.data.name}" registered`, 'success');
    await loadList();
    openDetail(r.data.id);
  });
});

document.getElementById('close-detail-btn').addEventListener('click', closeDetail);
document.getElementById('add-grant-btn').addEventListener('click', () => openGrantEditor(null));

document.getElementById('toggle-btn').addEventListener('click', () => {
  if (!detail.enabled) {
    post(`${BASE}/${detail.id}/enable`).then((r) => {
      if (!r.ok) return showToast(r.message, 'error');
      showToast('Integration re-enabled — workers must obtain new leases', 'success');
      refreshDetail();
    });
    return;
  }
  ConfirmModal.confirmDelete(`Disable "${detail.name}"?`, {
    bodyHtml:
      '<p>Every API key issued to this integration is revoked immediately and the worker can no longer authenticate. You can re-enable the integration later, but workers must obtain new leases.</p>',
    confirmLabel: 'Disable integration',
    onConfirm: async () => {
      const r = await post(`${BASE}/${detail.id}/disable`);
      if (!r.ok) return r;
      showToast('Integration disabled', 'success');
      refreshDetail();
      return { ok: true };
    },
  });
});

document.getElementById('rotate-btn').addEventListener('click', () => {
  ConfirmModal.confirmDelete(`Rotate credential for "${detail.name}"?`, {
    bodyHtml:
      '<p>The current credential stops working <strong>immediately</strong> (there is no overlap window). The worker will fail to authenticate until it is given the new credential. Leases it already holds keep working until they expire or are revoked.</p>',
    confirmLabel: 'Rotate credential',
    confirmClass: 'btn btn-primary',
    onConfirm: async () => {
      const r = await post(`${BASE}/${detail.id}/credential`);
      if (!r.ok) return r;
      showCredentialBanner(`New credential for "${detail.name}"`, r.data.credential);
      return { ok: true };
    },
  });
});

document.getElementById('delete-btn').addEventListener('click', () => {
  ConfirmModal.confirmDelete(`Delete "${detail.name}"?`, {
    bodyHtml:
      '<p>Deletes the integration, all of its grants and lease records, and revokes every API key issued to it. This cannot be undone.</p>',
    requireTypedName: detail.name,
    confirmLabel: 'Delete integration',
    onConfirm: async () => {
      const res = await apiFetch(`${BASE}/${detail.id}`, { method: 'DELETE' });
      if (!res) return { ok: false };
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        return { ok: false, message: b.message ?? 'Failed to delete integration' };
      }
      showToast('Integration deleted', 'success');
      closeDetail();
      return { ok: true };
    },
  });
});

loadList();
