const statusEl = document.getElementById('pdf-status');
const projectSelect = document.getElementById('project-select');
const configForm = document.getElementById('config-form');
const apiUrlInput = document.getElementById('api-url');
const authHeaderInput = document.getElementById('auth-header');
const htmlFieldInput = document.getElementById('html-field');
const responseModeSelect = document.getElementById('response-mode');
const enabledCheckbox = document.getElementById('enabled-checkbox');
const secretForm = document.getElementById('secret-form');
const secretValueInput = document.getElementById('secret-value');
const requestsTbody = document.getElementById('requests-tbody');

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

function renderRequestRow(request) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${request.status === 'success' ? '✅ success' : '❌ failed'}</td>
    <td>${request.durationMs !== null ? `${request.durationMs} ms` : '—'}</td>
    <td>${request.outputBytes !== null ? `${request.outputBytes} bytes` : '—'}</td>
    <td>${request.error ? escapeHtml(request.error) : ''}</td>
    <td>${new Date(request.createdAt).toLocaleString()}</td>
  `;
  return tr;
}

async function loadConfig() {
  const res = await apiFetch(`/admin/v1/pdf?projectId=${encodeURIComponent(currentProjectId)}`);
  if (!res) return;
  if (!res.ok) {
    statusEl.textContent = 'Failed to load config';
    return;
  }
  const { config } = await res.json();
  if (config) {
    apiUrlInput.value = config.apiUrl ?? '';
    authHeaderInput.value = config.authHeader ?? '';
    htmlFieldInput.value = config.htmlField ?? 'html';
    responseModeSelect.value = config.responseMode ?? 'binary';
    enabledCheckbox.checked = config.enabled;
    statusEl.textContent = `Configured (last updated ${new Date(config.updatedAt).toLocaleString()})`;
  } else {
    configForm.reset();
    htmlFieldInput.value = 'html';
    responseModeSelect.value = 'binary';
    statusEl.textContent = 'Not configured';
  }
}

async function loadRequests() {
  const res = await apiFetch(
    `/admin/v1/pdf/requests?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res || !res.ok) return;
  const { requests } = await res.json();
  requestsTbody.innerHTML = '';
  for (const request of requests) {
    requestsTbody.appendChild(renderRequestRow(request));
  }
}

function reload() {
  loadConfig();
  loadRequests();
}

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    apiUrl: apiUrlInput.value.trim(),
    authHeader: authHeaderInput.value.trim() || undefined,
    htmlField: htmlFieldInput.value.trim() || 'html',
    responseMode: responseModeSelect.value,
    enabled: enabledCheckbox.checked,
    projectId: currentProjectId,
  };

  const res = await apiFetch('/admin/v1/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res) return;
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    showToast(errBody.message ?? 'Failed to save config', 'error');
    return;
  }
  showToast('PDF config saved', 'success');
  loadConfig();
});

secretForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = secretValueInput.value;
  if (!value) return;

  const res = await apiFetch('/admin/v1/pdf/secret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    showToast(errBody.message ?? 'Failed to save secret', 'error');
    return;
  }
  showToast('Secret saved', 'success');
  secretForm.reset();
});

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  reload();
});
