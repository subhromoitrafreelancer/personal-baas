const tbody = document.getElementById('audit-tbody');
const statusEl = document.getElementById('audit-status');
const refreshBtn = document.getElementById('refresh-audit-btn');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');

const LIMIT = 50;
let offset = 0;

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function renderRow(event) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${new Date(event.createdAt).toLocaleString()}</td>
    <td><span class="badge">${escapeHtml(event.eventType)}</span></td>
    <td>${escapeHtml(event.userEmail ?? event.userId ?? '—')}</td>
    <td>${escapeHtml(event.ipAddress ?? '—')}</td>
    <td class="metadata-cell">${escapeHtml(JSON.stringify(event.metadata))}</td>
  `;
  return tr;
}

async function loadAudit() {
  statusEl.textContent = 'Loading…';
  const response = await fetch(`/admin/v1/audit?limit=${LIMIT}&offset=${offset}`);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return;
  }
  if (!response.ok) {
    statusEl.textContent = 'Failed to load audit log';
    return;
  }

  const { events, total } = await response.json();
  tbody.innerHTML = '';
  for (const event of events) {
    tbody.appendChild(renderRow(event));
  }
  statusEl.textContent = `${total} event(s)`;
  pageInfo.textContent = `${total === 0 ? 0 : offset + 1}–${Math.min(offset + LIMIT, total)} of ${total}`;
  prevPageBtn.disabled = offset === 0;
  nextPageBtn.disabled = offset + LIMIT >= total;
}

refreshBtn.addEventListener('click', loadAudit);
prevPageBtn.addEventListener('click', () => {
  offset = Math.max(0, offset - LIMIT);
  loadAudit();
});
nextPageBtn.addEventListener('click', () => {
  offset += LIMIT;
  loadAudit();
});

loadAudit();
