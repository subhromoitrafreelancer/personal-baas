const container = document.getElementById('api-objects-container');
const statusEl = document.getElementById('api-status');
const refreshBtn = document.getElementById('refresh-api-btn');
const toggleOpenapiBtn = document.getElementById('toggle-openapi-btn');
const downloadOpenapiBtn = document.getElementById('download-openapi-btn');
const openapiPanel = document.getElementById('openapi-panel');
const openapiJsonEl = document.getElementById('openapi-json');
const openRawOpenapiLink = document.getElementById('open-raw-openapi-link');
const projectSelect = document.getElementById('project-select');

let openapiSpec = null;
let allSchemas = [];
let currentSchemaName = null;

// PostgREST multi-schema project selection (Phase 9, scope.md §23): Accept-Profile picks the
// schema for reads (GET/HEAD), Content-Profile for writes (POST/PATCH/PUT/DELETE) — without one
// of these, PostgREST resolves against whichever schema is first in db-schemas, so every
// generated snippet needs the right one or it silently targets the wrong project.
function profileHeaderName(method) {
  return method === 'GET' || method === 'HEAD' ? 'Accept-Profile' : 'Content-Profile';
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

// Best-effort placeholder value for an example request body — good enough for a copyable
// snippet, not meant to satisfy every constraint (check constraints, custom domains, etc.).
function placeholderForType(dataType) {
  const type = dataType.toLowerCase();
  if (type.includes('int') || type.includes('numeric') || type.includes('real') || type.includes('double')) {
    return '0';
  }
  if (type.includes('bool')) return 'false';
  if (type.includes('json')) return '{}';
  if (type === 'uuid') return '"00000000-0000-0000-0000-000000000000"';
  if (type.includes('timestamp') || type === 'date') return JSON.stringify(new Date().toISOString());
  return '"example"';
}

function writableColumns(columns) {
  // Columns with a server-side default (serial/identity PKs, created_at defaults, etc.) are
  // typically left out of insert bodies — Postgres fills them in.
  return columns.filter((c) => !c.default);
}

function exampleBody(columns) {
  const cols = writableColumns(columns);
  if (cols.length === 0) return '{}';
  const lines = cols.map((c) => `  "${c.name}": ${placeholderForType(c.dataType)}`);
  return `{\n${lines.join(',\n')}\n}`;
}

function restUrl(name) {
  return `${window.location.origin}/rest/v1/${name}`;
}

function codeBlock(label, code) {
  const id = `snippet-${Math.random().toString(36).slice(2)}`;
  return `
    <div class="snippet-block">
      <h4>${escapeHtml(label)}</h4>
      <div class="snippet-code-wrap">
        <button class="snippet-copy-btn" type="button" data-copy-target="${id}" aria-label="Copy" title="Copy">${window.Icons.markup('copy')}</button>
        <pre id="${id}">${escapeHtml(code)}</pre>
      </div>
    </div>
  `;
}

function tableSnippets(table) {
  const url = restUrl(table.name);
  const pk = table.primaryKey?.columns[0];
  const filterExample = pk ? `?${pk}=eq.1` : '?id=eq.1';
  const acceptProfile = profileHeaderName('GET');
  const contentProfile = profileHeaderName('POST');

  let html = '';
  html += codeBlock(
    'Get all rows (cURL)',
    `curl "${url}?select=*&limit=10" \\\n  -H "${acceptProfile}: ${currentSchemaName}"`,
  );
  html += codeBlock(
    'Get all rows (fetch)',
    `const res = await fetch("${url}?select=*&limit=10", {\n  headers: { "${acceptProfile}": "${currentSchemaName}" },\n});\nconst data = await res.json();`,
  );

  if (table.kind === 'table' || table.kind === 'partitioned_table') {
    const body = exampleBody(table.columns);
    html += codeBlock(
      'Insert a row (cURL)',
      `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "${contentProfile}: ${currentSchemaName}" \\\n  -H "Prefer: return=representation" \\\n  -d '${body}'`,
    );
    html += codeBlock(
      'Insert a row (fetch)',
      `const res = await fetch("${url}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json", "${contentProfile}": "${currentSchemaName}", "Prefer": "return=representation" },\n  body: JSON.stringify(${body}),\n});\nconst data = await res.json();`,
    );
    html += codeBlock(
      'Update a row (cURL)',
      `curl -X PATCH "${url}${filterExample}" \\\n  -H "Content-Type: application/json" \\\n  -H "${contentProfile}: ${currentSchemaName}" \\\n  -d '${body}'`,
    );
    html += codeBlock(
      'Delete a row (cURL)',
      `curl -X DELETE "${url}${filterExample}" \\\n  -H "${contentProfile}: ${currentSchemaName}"`,
    );
  }

  return html;
}

function functionSnippet(fn) {
  const url = `${window.location.origin}/rest/v1/rpc/${fn.name}`;
  const contentProfile = profileHeaderName('POST');
  return codeBlock(
    `Call ${fn.name}() (cURL)`,
    `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "${contentProfile}: ${currentSchemaName}" \\\n  -d '{}'`,
  );
}

function renderTableCard(table) {
  const card = document.createElement('div');
  card.className = 'api-object-card';

  const header = document.createElement('div');
  header.className = 'api-object-header';
  header.innerHTML = `<span class="api-object-name">${escapeHtml(table.name)}</span><span class="badge">${escapeHtml(table.kind)}</span>`;

  const body = document.createElement('div');
  body.className = 'api-object-body';
  body.hidden = true;
  body.innerHTML = tableSnippets(table);

  header.addEventListener('click', () => {
    body.hidden = !body.hidden;
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function renderFunctionCard(fn) {
  const card = document.createElement('div');
  card.className = 'api-object-card';

  const header = document.createElement('div');
  header.className = 'api-object-header';
  header.innerHTML = `<span class="api-object-name">${escapeHtml(fn.name)}(${escapeHtml(fn.arguments)})</span><span class="badge">function</span>`;

  const body = document.createElement('div');
  body.className = 'api-object-body';
  body.hidden = true;
  body.innerHTML = functionSnippet(fn);

  header.addEventListener('click', () => {
    body.hidden = !body.hidden;
  });

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function renderApiObjects() {
  const apiSchema = allSchemas.find((s) => s.name === currentSchemaName);

  container.innerHTML = '';
  if (!apiSchema || (apiSchema.tables.length === 0 && apiSchema.functions.length === 0)) {
    container.innerHTML = `<p>No objects exposed in the <code>${escapeHtml(currentSchemaName || '')}</code> schema yet — create one in the SQL editor.</p>`;
    statusEl.textContent = '';
    return;
  }

  for (const table of apiSchema.tables) {
    container.appendChild(renderTableCard(table));
  }
  for (const fn of apiSchema.functions) {
    container.appendChild(renderFunctionCard(fn));
  }
  statusEl.textContent = `${apiSchema.tables.length} object(s), ${apiSchema.functions.length} function(s)`;
}

async function loadApiObjects() {
  statusEl.textContent = 'Loading…';
  try {
    const response = await fetch('/admin/v1/database/objects');
    if (response.status === 401) {
      window.location.href = '/admin/login';
      return;
    }
    if (!response.ok) {
      statusEl.textContent = 'Failed to load API objects';
      return;
    }
    const { schemas } = await response.json();
    allSchemas = schemas;
    renderApiObjects();
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : 'Failed to load API objects';
  }
}

refreshBtn.addEventListener('click', loadApiObjects);
initProjectSelector(
  projectSelect,
  (schemaName) => {
    currentSchemaName = schemaName;
    openapiSpec = null;
    openapiJsonEl.textContent = '';
    openRawOpenapiLink.href = `/admin/v1/database/openapi?schema=${encodeURIComponent(schemaName)}`;
    if (allSchemas.length > 0) {
      renderApiObjects();
    } else {
      loadApiObjects();
    }
  },
  { optionValue: 'schemaName', initialValue: new URLSearchParams(window.location.search).get('schema') },
);

async function loadOpenapiSpec() {
  openapiJsonEl.textContent = 'Loading…';
  try {
    // control-server proxies to PostgREST's root (its own OpenAPI document) and sets
    // Accept-Profile server-side, since a plain link/tab can't set custom headers — this
    // keeps "Open raw in new tab" scoped to the right project's schema too (Phase 9).
    const response = await fetch(`/admin/v1/database/openapi?schema=${encodeURIComponent(currentSchemaName)}`);
    openapiSpec = await response.json();
    openapiJsonEl.textContent = JSON.stringify(openapiSpec, null, 2);
  } catch (err) {
    openapiJsonEl.textContent = `Failed to load OpenAPI spec: ${err instanceof Error ? err.message : err}`;
  }
}

toggleOpenapiBtn.addEventListener('click', () => {
  openapiPanel.hidden = !openapiPanel.hidden;
  if (!openapiPanel.hidden && !openapiSpec) {
    loadOpenapiSpec();
  }
});

downloadOpenapiBtn.addEventListener('click', () => {
  if (!openapiSpec) return;
  const blob = new Blob([JSON.stringify(openapiSpec, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'openapi.json';
  a.click();
  URL.revokeObjectURL(url);
});
