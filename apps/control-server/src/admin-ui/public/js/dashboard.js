const grid = document.getElementById('kpi-grid');

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

async function loadApiTablesCard() {
  try {
    const { schemas } = await fetchJson('/admin/v1/database/objects');
    const apiSchema = schemas.find((schema) => schema.name === 'api');
    const tables = apiSchema ? apiSchema.tables : [];
    const unprotected = tables.filter((table) => table.apiExposed && !table.rlsEnabled).length;
    return card(
      'API schema tables',
      tables.length,
      unprotected > 0 ? `${unprotected} without RLS` : 'All tables have RLS enabled',
      unprotected > 0 ? 'kpi-warning' : '',
    );
  } catch (err) {
    return errorCard('API schema tables', err.message);
  }
}

async function loadUsersCard() {
  try {
    const { total } = await fetchJson('/admin/v1/users?limit=1');
    return card('App users', total, 'Registered via /auth/v1/signup');
  } catch (err) {
    return errorCard('App users', err.message);
  }
}

async function loadApiKeysCard() {
  try {
    const { keys } = await fetchJson('/admin/v1/api-keys');
    const active = keys.filter((key) => !key.revokedAt);
    const publishable = active.filter((key) => key.kind === 'publishable').length;
    const secret = active.filter((key) => key.kind === 'secret').length;
    return card('Active API keys', active.length, `${publishable} publishable · ${secret} secret`);
  } catch (err) {
    return errorCard('Active API keys', err.message);
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
  const cards = await Promise.all([loadApiTablesCard(), loadUsersCard(), loadApiKeysCard(), loadAuditCard()]);
  grid.replaceChildren(...cards);
})();
