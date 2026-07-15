const container = document.getElementById('schemas-container');
const statusEl = document.getElementById('objects-status');
const refreshBtn = document.getElementById('refresh-objects-btn');

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function renderColumns(columns) {
  if (columns.length === 0) return '';
  const rows = columns
    .map(
      (col) => `<tr>
        <td>
          <span class="copyable-cell">
            ${escapeHtml(col.name)}
            <button type="button" class="copy-btn" data-copy-value="${escapeHtml(col.name)}">Copy</button>
          </span>
        </td>
        <td>${escapeHtml(col.dataType)}</td>
        <td>${col.nullable ? 'YES' : 'NO'}</td>
        <td>${col.default ? escapeHtml(col.default) : ''}</td>
      </tr>`,
    )
    .join('');
  return `<h4>Columns</h4><table><thead><tr><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderKeys(table) {
  const parts = [];
  if (table.primaryKey) {
    parts.push(`<h4>Primary key</h4><div>${escapeHtml(table.primaryKey.name)} (${table.primaryKey.columns.map(escapeHtml).join(', ')})</div>`);
  }
  if (table.uniqueConstraints.length > 0) {
    parts.push(
      `<h4>Unique constraints</h4><ul>${table.uniqueConstraints
        .map((u) => `<li>${escapeHtml(u.name)} (${u.columns.map(escapeHtml).join(', ')})</li>`)
        .join('')}</ul>`,
    );
  }
  if (table.foreignKeys.length > 0) {
    parts.push(
      `<h4>Foreign keys</h4><ul>${table.foreignKeys
        .map(
          (fk) =>
            `<li>${escapeHtml(fk.name)}: (${fk.columns.map(escapeHtml).join(', ')}) &rarr; ${escapeHtml(fk.referencesSchema)}.${escapeHtml(fk.referencesTable)} (${fk.referencesColumns.map(escapeHtml).join(', ')})</li>`,
        )
        .join('')}</ul>`,
    );
  }
  return parts.join('');
}

function renderIndexes(indexes) {
  if (indexes.length === 0) return '';
  return `<h4>Indexes</h4><ul>${indexes
    .map((idx) => `<li><code>${escapeHtml(idx.definition)}</code></li>`)
    .join('')}</ul>`;
}

function renderPolicies(policies) {
  if (policies.length === 0) return '';
  return `<h4>Policies</h4><ul>${policies
    .map(
      (p) =>
        `<li>${escapeHtml(p.name)} (${escapeHtml(p.command)}, roles: ${p.roles.map(escapeHtml).join(', ')})${
          p.using ? ` — using: <code>${escapeHtml(p.using)}</code>` : ''
        }${p.withCheck ? ` — with check: <code>${escapeHtml(p.withCheck)}</code>` : ''}</li>`,
    )
    .join('')}</ul>`;
}

// Only api-schema tables/views are ever reachable through PostgREST, so exposure risk is
// scoped to those. Two distinct cases, not the same severity: no RLS means any role with a
// grant has unrestricted row access (the dangerous one); RLS-on-with-zero-policies is
// default-deny (nothing gets through except bypassrls roles like service_role) — safe, but
// worth flagging since it usually means the table isn't usable via the API yet either.
function exposureWarning(table) {
  if (!table.apiExposed) return '';
  if (!table.rlsEnabled) {
    return '<span class="badge exposure-danger">⚠ No RLS — unrestricted for any granted role</span>';
  }
  if (table.policies.length === 0) {
    return '<span class="badge exposure-info">ℹ RLS on, no policies — default-deny</span>';
  }
  return '';
}

function renderTable(table, schemaName) {
  const block = document.createElement('div');
  block.className = 'table-block';
  const qualifiedName = `${schemaName}.${table.name}`;

  const header = document.createElement('div');
  header.className = 'table-header';
  header.innerHTML = `
    <span class="table-name">${escapeHtml(table.name)}</span>
    <button type="button" class="copy-btn" data-copy-value="${escapeHtml(qualifiedName)}">Copy</button>
    <span class="badge">${escapeHtml(table.kind)}</span>
    ${table.apiExposed ? '<span class="badge api-exposed">API exposed</span>' : ''}
    <span class="badge ${table.rlsEnabled ? 'rls-on' : 'rls-off'}">${table.rlsEnabled ? 'RLS enabled' : 'RLS disabled'}</span>
    ${exposureWarning(table)}
  `;

  const details = document.createElement('div');
  details.className = 'table-details';
  details.hidden = true;
  details.innerHTML =
    renderColumns(table.columns) + renderKeys(table) + renderIndexes(table.indexes) + renderPolicies(table.policies);

  header.addEventListener('click', (event) => {
    if (event.target.closest('.copy-btn')) return;
    details.hidden = !details.hidden;
  });

  block.appendChild(header);
  block.appendChild(details);
  return block;
}

function renderSchema(schema) {
  const block = document.createElement('div');
  block.className = 'schema-block';

  const header = document.createElement('div');
  header.className = 'schema-header';
  header.textContent = schema.name;
  block.appendChild(header);

  for (const table of schema.tables) {
    block.appendChild(renderTable(table, schema.name));
  }

  if (schema.functions.length > 0) {
    const functionsBlock = document.createElement('div');
    functionsBlock.className = 'functions-block';
    functionsBlock.innerHTML = `<h4>Functions</h4>${schema.functions
      .map(
        (fn) =>
          `<div class="function-item">${escapeHtml(fn.name)}(${escapeHtml(fn.arguments)}) &rarr; ${escapeHtml(fn.returnType)}</div>`,
      )
      .join('')}`;
    block.appendChild(functionsBlock);
  }

  return block;
}

async function loadObjects() {
  statusEl.textContent = 'Loading…';
  try {
    const response = await fetch('/admin/v1/database/objects');
    if (response.status === 401) {
      window.location.href = '/admin/login';
      return;
    }
    if (!response.ok) {
      statusEl.textContent = 'Failed to load database objects';
      return;
    }
    const { schemas } = await response.json();
    container.innerHTML = '';
    for (const schema of schemas) {
      container.appendChild(renderSchema(schema));
    }
    statusEl.textContent = `Loaded ${schemas.length} schema(s)`;
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : 'Failed to load database objects';
  }
}

refreshBtn.addEventListener('click', loadObjects);
loadObjects();
