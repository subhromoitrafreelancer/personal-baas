const projectSelect = document.getElementById('project-select');
const hostingStatus = document.getElementById('hosting-status');
const fileCountEl = document.getElementById('hosting-file-count');
const totalBytesEl = document.getElementById('hosting-total-bytes');
const lastDeployedEl = document.getElementById('hosting-last-deployed');
const liveLinkEl = document.getElementById('hosting-live-link');
const deployForm = document.getElementById('deploy-form');
const deployFile = document.getElementById('deploy-file');

let currentProjectId = null;
let currentProjectSlug = null;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return null;
  }
  return response;
}

function updateLiveLink() {
  const url = `${window.location.origin}/sites/${encodeURIComponent(currentProjectSlug)}/`;
  liveLinkEl.href = url;
  liveLinkEl.innerHTML = `${window.Icons.markup('external-link')} ${url}`;
}

async function loadStats() {
  hostingStatus.textContent = 'Loading…';
  const res = await apiFetch(`/admin/v1/hosting?projectId=${encodeURIComponent(currentProjectId)}`);
  if (!res) return;
  if (!res.ok) {
    hostingStatus.textContent = 'Failed to load hosting stats';
    return;
  }
  const stats = await res.json();
  fileCountEl.textContent = String(stats.fileCount);
  totalBytesEl.textContent = formatBytes(stats.totalBytes);
  lastDeployedEl.textContent = stats.lastDeployedAt ? new Date(stats.lastDeployedAt).toLocaleString() : 'Never';
  hostingStatus.textContent = '';
}

deployForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = deployFile.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  hostingStatus.textContent = 'Deploying…';
  const res = await apiFetch(`/admin/v1/hosting/deploy?projectId=${encodeURIComponent(currentProjectId)}`, {
    method: 'POST',
    body: formData,
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    hostingStatus.textContent = '';
    showToast(body.message ?? 'Deploy failed', 'error');
    return;
  }
  showToast('Deployed successfully', 'success');
  deployFile.value = '';
  loadStats();
});

initProjectSelector(projectSelect, (projectId, project) => {
  currentProjectId = projectId;
  currentProjectSlug = project ? project.slug : null;
  updateLiveLink();
  loadStats();
});
