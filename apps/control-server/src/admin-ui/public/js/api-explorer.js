const container = document.getElementById('api-objects-container');
const statusEl = document.getElementById('api-status');
const refreshBtn = document.getElementById('refresh-api-btn');
const toggleOpenapiBtn = document.getElementById('toggle-openapi-btn');
const downloadOpenapiBtn = document.getElementById('download-openapi-btn');
const openapiPanel = document.getElementById('openapi-panel');
const openapiJsonEl = document.getElementById('openapi-json');

let openapiSpec = null;

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
        <button class="snippet-copy-btn" type="button" data-copy-target="${id}">Copy</button>
        <pre id="${id}">${escapeHtml(code)}</pre>
      </div>
    </div>
  `;
}

function tableSnippets(table) {
  const url = restUrl(table.name);
  const pk = table.primaryKey?.columns[0];
  const filterExample = pk ? `?${pk}=eq.1` : '?id=eq.1';

  let html = '';
  html += codeBlock('Get all rows (cURL)', `curl "${url}?select=*&limit=10"`);
  html += codeBlock(
    'Get all rows (fetch)',
    `const res = await fetch("${url}?select=*&limit=10");\nconst data = await res.json();`,
  );

  if (table.kind === 'table' || table.kind === 'partitioned_table') {
    const body = exampleBody(table.columns);
    html += codeBlock(
      'Insert a row (cURL)',
      `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -H "Prefer: return=representation" \\\n  -d '${body}'`,
    );
    html += codeBlock(
      'Insert a row (fetch)',
      `const res = await fetch("${url}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json", "Prefer": "return=representation" },\n  body: JSON.stringify(${body}),\n});\nconst data = await res.json();`,
    );
    html += codeBlock('Update a row (cURL)', `curl -X PATCH "${url}${filterExample}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`);
    html += codeBlock('Delete a row (cURL)', `curl -X DELETE "${url}${filterExample}"`);
  }

  return html;
}

function functionSnippet(fn) {
  const url = `${window.location.origin}/rest/v1/rpc/${fn.name}`;
  return codeBlock(`Call ${fn.name}() (cURL)`, `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`);
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
    const apiSchema = schemas.find((s) => s.name === 'api');

    container.innerHTML = '';
    if (!apiSchema || (apiSchema.tables.length === 0 && apiSchema.functions.length === 0)) {
      container.innerHTML = '<p>No objects exposed in the <code>api</code> schema yet — create one in the SQL editor.</p>';
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
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : 'Failed to load API objects';
  }
}

refreshBtn.addEventListener('click', loadApiObjects);
loadApiObjects();

async function loadOpenapiSpec() {
  openapiJsonEl.textContent = 'Loading…';
  try {
    // PostgREST's own root endpoint (proxied at /rest/v1/) doubles as its OpenAPI document —
    // no control-server endpoint needed, this is a same-origin request through Caddy.
    const response = await fetch('/rest/v1/');
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
