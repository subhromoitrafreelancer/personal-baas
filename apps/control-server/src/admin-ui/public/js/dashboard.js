const projectsTableBody = document.getElementById('projects-table-body');
const storageGrid = document.getElementById('storage-kpi-grid');
const grid = document.getElementById('kpi-grid');

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function card(label, value, sub, subClass) {
  const div = document.createElement('div');
  div.className = 'kpi-card';
  div.innerHTML = `
    <span class="kpi-label">${label}</span>
    <span class="kpi-value">${value}</span>
    ${sub ? `<span class="kpi-sub${subClass ? ' ' + subClass : ''}">${sub}</span>` : ''}
  `;
  return div;
}

function errorCard(label, message) {
  const div = document.createElement('div');
  div.className = 'kpi-card kpi-error';
  div.innerHTML = `<span class="kpi-label">${label}</span><span>Failed to load: ${message}</span>`;
  return div;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function projectRow(project) {
  const warnings =
    project.unprotectedTableCount > 0
      ? `<span class="badge exposure-danger">⚠ ${project.unprotectedTableCount} table(s) without RLS</span>`
      : '';
  return `
    <tr>
      <td>${escapeHtml(project.name)} <span class="badge">${escapeHtml(project.slug)}</span></td>
      <td>${project.tableCount}</td>
      <td>${project.userCount}</td>
      <td>${project.activeKeyCount} <span class="kpi-sub">(${project.publishableKeyCount} publishable · ${project.secretKeyCount} secret)</span></td>
      <td>${warnings}</td>
    </tr>
  `;
}

async function loadDashboardSummary() {
  try {
    const summary = await fetchJson('/admin/v1/dashboard/summary');

    projectsTableBody.innerHTML = summary.projects.map(projectRow).join('');

    const storage = summary.storage;
    storageGrid.replaceChildren(
      card('Buckets', storage.bucketCount),
      card('Objects', storage.objectCount),
      card('Storage used', formatBytes(storage.totalBytes)),
      storage.emptyBucketCount > 0
        ? card('Empty buckets', storage.emptyBucketCount, `${storage.emptyBucketCount} bucket(s) have no objects`, 'kpi-warning')
        : card('Empty buckets', 0),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    projectsTableBody.innerHTML = `<tr><td colspan="5">Failed to load: ${escapeHtml(message)}</td></tr>`;
    storageGrid.replaceChildren(errorCard('Storage', message));
  }
}

async function loadAuditCard() {
  try {
    const { total, events } = await fetchJson('/admin/v1/audit?limit=1');
    const latest = events[0] ? new Date(events[0].createdAt).toLocaleString() : 'No events yet';
    return card('Audit events', total, latest);
  } catch (err) {
    return errorCard('Audit events', err.message);
  }
}

(async () => {
  loadDashboardSummary();
  const cards = await Promise.all([loadAuditCard()]);
  grid.replaceChildren(...cards);
})();
