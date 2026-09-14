const projectsTableBody = document.getElementById('projects-table-body');
const storageReadouts = document.getElementById('storage-readouts');
const otherReadouts = document.getElementById('other-readouts');

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function readout(label, value, sub, subClass) {
  const div = document.createElement('div');
  div.className = 'instrument-cell';
  div.innerHTML = `
    <span class="instrument-label">${label}</span>
    <span class="instrument-value" data-live>${value}</span>
    ${sub ? `<span class="instrument-sub${subClass ? ' ' + subClass : ''}">${sub}</span>` : ''}
  `;
  return div;
}

function errorReadout(label, message) {
  const div = document.createElement('div');
  div.className = 'instrument-cell instrument-error';
  div.innerHTML = `<span class="instrument-label">${label}</span><span class="instrument-sub">Failed to load: ${escapeHtml(message)}</span>`;
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
  const hasWarning = project.unprotectedTableCount > 0;
  const status = hasWarning
    ? `<span class="badge exposure-danger">${window.Icons.markup('warning', { size: 12 })} ${project.unprotectedTableCount} table(s) without RLS</span>`
    : `<span class="badge status-active">${window.Icons.markup('check', { size: 12 })} nominal</span>`;
  return `
    <tr class="channel-row${hasWarning ? ' channel-row-danger' : ' channel-row-nominal'}">
      <td>${escapeHtml(project.name)} <span class="badge">${escapeHtml(project.slug)}</span></td>
      <td data-kind="numeric">${project.tableCount}</td>
      <td data-kind="numeric">${project.userCount}</td>
      <td data-kind="numeric">${project.activeKeyCount} <span class="instrument-sub">(${project.publishableKeyCount} publishable · ${project.secretKeyCount} secret)</span></td>
      <td>${status}</td>
    </tr>
  `;
}

async function loadDashboardSummary() {
  try {
    const summary = await fetchJson('/admin/v1/dashboard/summary');

    projectsTableBody.innerHTML = summary.projects.map(projectRow).join('');

    const storage = summary.storage;
    storageReadouts.replaceChildren(
      readout('Buckets', storage.bucketCount),
      readout('Objects', storage.objectCount),
      readout('Storage used', formatBytes(storage.totalBytes)),
      storage.emptyBucketCount > 0
        ? readout(
            'Empty buckets',
            storage.emptyBucketCount,
            `${storage.emptyBucketCount} bucket(s) have no objects`,
            'instrument-warning',
          )
        : readout('Empty buckets', 0),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    projectsTableBody.innerHTML = `<tr><td colspan="5">Failed to load: ${escapeHtml(message)}</td></tr>`;
    storageReadouts.replaceChildren(errorReadout('Storage', message));
  }
}

// Shared skeleton for a single readout that loads its own data: fetch, format via `formatter`,
// fall back to an error cell on failure. `formatter(data)` returns `{ value, sub, subClass? }`.
async function loadReadout(label, url, formatter) {
  try {
    const data = await fetchJson(url);
    const { value, sub, subClass } = formatter(data);
    return readout(label, value, sub, subClass);
  } catch (err) {
    return errorReadout(label, err.message);
  }
}

function loadAuditReadout() {
  return loadReadout('Audit events', '/admin/v1/audit?limit=1', ({ total, events }) => ({
    value: total,
    sub: events[0] ? new Date(events[0].createdAt).toLocaleString() : 'No events yet',
  }));
}

function loadRealtimeReadout() {
  // This instance only — see realtime.gateway.ts/realtime.service.ts's own comments on why.
  return loadReadout(
    'Realtime connections',
    '/admin/v1/realtime/stats',
    ({ activeConnections, activeSubscriptions }) => ({
      value: activeConnections,
      sub: `${activeSubscriptions} subscription(s), this instance`,
    }),
  );
}

async function refresh() {
  await loadDashboardSummary();
  const cells = await Promise.all([loadAuditReadout(), loadRealtimeReadout()]);
  otherReadouts.replaceChildren(...cells);
}

// Live instrumentation, not a one-shot page load: values re-poll on an interval so the
// direction contract's signature interaction (a value-tick on change) has something real to
// show. Paused while the tab is hidden so it doesn't spend cycles on a background tab.
const REFRESH_MS = 45000;
let refreshTimer = null;

function scheduleRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(refresh, REFRESH_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearInterval(refreshTimer);
  } else {
    refresh();
    scheduleRefresh();
  }
});

(async () => {
  await refresh();
  scheduleRefresh();
})();
