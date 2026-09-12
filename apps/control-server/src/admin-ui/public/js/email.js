const statusEl = document.getElementById('email-status');
const projectSelect = document.getElementById('project-select');
const configForm = document.getElementById('config-form');
const providerSelect = document.getElementById('provider-select');
const fromAddressInput = document.getElementById('from-address');
const enabledCheckbox = document.getElementById('enabled-checkbox');
const smtpFields = document.getElementById('smtp-fields');
const smtpHostInput = document.getElementById('smtp-host');
const smtpPortInput = document.getElementById('smtp-port');
const smtpSecureCheckbox = document.getElementById('smtp-secure');
const smtpUsernameInput = document.getElementById('smtp-username');
const secretForm = document.getElementById('secret-form');
const secretValueInput = document.getElementById('secret-value');
const sentTbody = document.getElementById('sent-tbody');

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

function updateSmtpFieldsVisibility() {
  smtpFields.hidden = providerSelect.value !== 'smtp';
}

providerSelect.addEventListener('change', updateSmtpFieldsVisibility);

function renderSentRow(message) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${escapeHtml(message.toAddress)}</td>
    <td>${escapeHtml(message.subject)}</td>
    <td>${escapeHtml(message.provider ?? '—')}</td>
    <td>${message.status === 'sent' ? '✅ sent' : '❌ failed'}</td>
    <td>${message.error ? escapeHtml(message.error) : ''}</td>
    <td>${new Date(message.createdAt).toLocaleString()}</td>
  `;
  return tr;
}

async function loadConfig() {
  const res = await apiFetch(`/admin/v1/email?projectId=${encodeURIComponent(currentProjectId)}`);
  if (!res) return;
  if (!res.ok) {
    statusEl.textContent = 'Failed to load config';
    return;
  }
  const { config } = await res.json();
  if (config) {
    providerSelect.value = config.provider;
    fromAddressInput.value = config.fromAddress ?? '';
    enabledCheckbox.checked = config.enabled;
    smtpHostInput.value = config.smtpHost ?? '';
    smtpPortInput.value = config.smtpPort ?? '';
    smtpSecureCheckbox.checked = Boolean(config.smtpSecure);
    smtpUsernameInput.value = config.smtpUsername ?? '';
    statusEl.textContent = `Configured (last updated ${new Date(config.updatedAt).toLocaleString()})`;
  } else {
    configForm.reset();
    providerSelect.value = 'resend';
    statusEl.textContent = 'Not configured';
  }
  updateSmtpFieldsVisibility();
}

async function loadSent() {
  const res = await apiFetch(
    `/admin/v1/email/sent?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res || !res.ok) return;
  const { messages } = await res.json();
  sentTbody.innerHTML = '';
  for (const message of messages) {
    sentTbody.appendChild(renderSentRow(message));
  }
}

function reload() {
  loadConfig();
  loadSent();
}

configForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    provider: providerSelect.value,
    fromAddress: fromAddressInput.value.trim(),
    enabled: enabledCheckbox.checked,
    projectId: currentProjectId,
  };
  if (providerSelect.value === 'smtp') {
    body.smtpHost = smtpHostInput.value.trim();
    body.smtpPort = Number(smtpPortInput.value);
    body.smtpSecure = smtpSecureCheckbox.checked;
    body.smtpUsername = smtpUsernameInput.value.trim() || undefined;
  }

  const res = await apiFetch('/admin/v1/email', {
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
  showToast('Email config saved', 'success');
  loadConfig();
});

secretForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = secretValueInput.value;
  if (!value) return;

  const res = await apiFetch('/admin/v1/email/secret', {
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
