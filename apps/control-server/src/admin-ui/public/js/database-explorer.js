const container = document.getElementById('schemas-container');
const schemaNav = document.getElementById('schema-nav');
const statusEl = document.getElementById('objects-status');
const refreshBtn = document.getElementById('refresh-objects-btn');
const projectSelect = document.getElementById('project-select');

let allSchemas = [];
let schemaFilter = '';

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function schemaAnchorId(schemaName) {
  return `schema-${schemaName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

function copyButton(value) {
  return `<button type="button" class="copy-btn" data-copy-value="${escapeHtml(value)}" aria-label="Copy" title="Copy">${window.Icons.markup('copy')}</button>`;
}

function renderColumns(columns) {
  if (columns.length === 0) return '';
  const rows = columns
    .map(
      (col) => `<tr>
        <td>
          <span class="copyable-cell">
            ${escapeHtml(col.name)}
            ${copyButton(col.name)}
          </span>
        </td>
        <td>${escapeHtml(col.dataType)}</td>
        <td>${col.nullable ? 'YES' : 'NO'}</td>
        <td>${col.default ? escapeHtml(col.default) : ''}</td>
      </tr>`,
    )
    .join('');
  return `<div class="table-detail-columns"><h4>Columns</h4><table><thead><tr><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderKeys(table) {
  const parts = [];
  if (table.primaryKey) {
    parts.push(`<div class="table-detail-meta-card"><h4>Primary key</h4><div>${escapeHtml(table.primaryKey.name)} (${table.primaryKey.columns.map(escapeHtml).join(', ')})</div></div>`);
  }
  if (table.uniqueConstraints.length > 0) {
    parts.push(
      `<div class="table-detail-meta-card"><h4>Unique constraints</h4><ul>${table.uniqueConstraints
        .map((u) => `<li>${escapeHtml(u.name)} (${u.columns.map(escapeHtml).join(', ')})</li>`)
        .join('')}</ul></div>`,
    );
  }
  if (table.foreignKeys.length > 0) {
    parts.push(
      `<div class="table-detail-meta-card"><h4>Foreign keys</h4><ul>${table.foreignKeys
        .map(
          (fk) =>
            `<li>${escapeHtml(fk.name)}: (${fk.columns.map(escapeHtml).join(', ')}) &rarr; ${escapeHtml(fk.referencesSchema)}.${escapeHtml(fk.referencesTable)} (${fk.referencesColumns.map(escapeHtml).join(', ')})</li>`,
        )
        .join('')}</ul></div>`,
    );
  }
  return parts.join('');
}

function renderIndexes(indexes) {
  if (indexes.length === 0) return '';
  return `<div class="table-detail-meta-card"><h4>Indexes</h4><ul>${indexes
    .map((idx) => `<li><code>${escapeHtml(idx.definition)}</code></li>`)
    .join('')}</ul></div>`;
}

function renderPolicies(policies) {
  if (policies.length === 0) return '';
  return `<div class="table-detail-meta-card"><h4>Policies</h4><ul>${policies
    .map(
      (p) =>
        `<li>${escapeHtml(p.name)} (${escapeHtml(p.command)}, roles: ${p.roles.map(escapeHtml).join(', ')})${
          p.using ? ` — using: <code>${escapeHtml(p.using)}</code>` : ''
        }${p.withCheck ? ` — with check: <code>${escapeHtml(p.withCheck)}</code>` : ''}</li>`,
    )
    .join('')}</ul></div>`;
}

// Only api-schema tables/views are ever reachable through PostgREST, so exposure risk is
// scoped to those. Two distinct cases, not the same severity: no RLS means any role with a
// grant has unrestricted row access (the dangerous one); RLS-on-with-zero-policies is
// default-deny (nothing gets through except bypassrls roles like service_role) — safe, but
// worth flagging since it usually means the table isn't usable via the API yet either.
function exposureWarning(table) {
  if (!table.apiExposed) return '';
  if (!table.rlsEnabled) {
    return `<span class="badge exposure-danger">${window.Icons.markup('warning', { size: 12 })} No RLS — unrestricted for any granted role</span>`;
  }
  if (table.policies.length === 0) {
    return '<span class="badge exposure-info">RLS on, no policies — default-deny</span>';
  }
  return '';
}

function renderTable(table, schemaName, expanded) {
  const block = document.createElement('div');
  block.className = 'table-block';
  const qualifiedName = `${schemaName}.${table.name}`;

  const header = document.createElement('div');
  header.className = 'table-header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', String(expanded));
  header.innerHTML = `
    ${window.Icons.markup('chevron', { size: 14 })}
    <span class="table-name">${escapeHtml(table.name)}</span>
    ${copyButton(qualifiedName)}
    <span class="badge">${escapeHtml(table.kind)}</span>
    ${table.apiExposed ? '<span class="badge api-exposed">API exposed</span>' : ''}
    <span class="badge ${table.rlsEnabled ? 'rls-on' : 'rls-off'}">${table.rlsEnabled ? 'RLS enabled' : 'RLS disabled'}</span>
    ${exposureWarning(table)}
  `;
  header.querySelector('.icon').classList.add('chevron');

  const details = document.createElement('div');
  details.className = 'table-details';
  details.hidden = !expanded;
  details.innerHTML =
    renderColumns(table.columns) +
    `<div class="table-detail-meta">${renderKeys(table)}${renderIndexes(table.indexes)}${renderPolicies(table.policies)}</div>`;

  const toggle = () => {
    const next = details.hidden;
    details.hidden = !next;
    header.setAttribute('aria-expanded', String(next));
  };
  header.addEventListener('click', (event) => {
    if (event.target.closest('.copy-btn')) return;
    toggle();
  });
  header.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });

  block.appendChild(header);
  block.appendChild(details);
  return block;
}

function renderSchema(schema) {
  const block = document.createElement('div');
  block.className = 'schema-block';
  block.id = schemaAnchorId(schema.name);

  const header = document.createElement('div');
  header.className = 'schema-header';
  header.innerHTML = `${escapeHtml(schema.name)} <span class="schema-table-count">${schema.tables.length} table${schema.tables.length === 1 ? '' : 's'}</span>`;
  block.appendChild(header);

  schema.tables.forEach((table, index) => {
    block.appendChild(renderTable(table, schema.name, index === 0));
  });

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

function renderSchemaNav(schemas) {
  schemaNav.innerHTML = schemas
    .map((schema) => `<button type="button" class="schema-nav-link" data-schema="${escapeHtml(schema.name)}">${escapeHtml(schema.name)}</button>`)
    .join('');
}

function jumpToSchema(schemaName) {
  const target = document.getElementById(schemaAnchorId(schemaName));
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const firstHeader = target.querySelector('.table-header');
  if (firstHeader && firstHeader.getAttribute('aria-expanded') === 'false') {
    firstHeader.click();
  }
  schemaNav.querySelectorAll('.schema-nav-link').forEach((link) => {
    link.classList.toggle('current', link.dataset.schema === schemaName);
  });
}

function renderSchemas() {
  const schemas = schemaFilter ? allSchemas.filter((s) => s.name === schemaFilter) : allSchemas;
  container.innerHTML = '';
  for (const schema of schemas) {
    container.appendChild(renderSchema(schema));
  }
  renderSchemaNav(schemas);
  statusEl.textContent = schemaFilter
    ? `Loaded ${schemas.length} of ${allSchemas.length} schema(s)`
    : `Loaded ${schemas.length} schema(s)`;

  const requestedSchema = new URLSearchParams(window.location.search).get('schema');
  if (requestedSchema && schemas.some((s) => s.name === requestedSchema)) {
    jumpToSchema(requestedSchema);
  }
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
    allSchemas = schemas;
    renderSchemas();
  } catch (err) {
    statusEl.textContent = err instanceof Error ? err.message : 'Failed to load database objects';
  }
}

schemaNav.addEventListener('click', (event) => {
  const link = event.target.closest('.schema-nav-link');
  if (!link) return;
  jumpToSchema(link.dataset.schema);
});

refreshBtn.addEventListener('click', loadObjects);
initProjectSelector(
  projectSelect,
  (schemaName) => {
    schemaFilter = schemaName;
    renderSchemas();
  },
  { allLabel: 'All schemas', optionValue: 'schemaName' },
);
loadObjects();
