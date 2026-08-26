import {
  EditorView,
  basicSetup,
  EditorState,
  sql,
  PostgreSQL,
} from '/admin/static/js/vendor/codemirror.bundle.js';

const container = document.getElementById('schemas-container');
const schemaNav = document.getElementById('schema-nav');
const statusEl = document.getElementById('objects-status');
const refreshBtn = document.getElementById('refresh-objects-btn');
const projectSelect = document.getElementById('project-select');

const modalOverlay = document.getElementById('modal-overlay');
const modalEl = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalFooter = document.getElementById('modal-footer');
const modalCloseBtn = document.getElementById('modal-close-btn');

const COLUMNS_PAGE_SIZE = 5;

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

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return null;
  }
  return response;
}

// Generic modal primitive (Phase 15, scope.md §29) — every prior destructive admin action used a
// bare window.confirm(); table deletion needs more (blocker lists, a typed-name-to-confirm
// field), and the function-source viewer needs a place to mount a read-only editor.
let activeSourceEditor = null;

function closeModal() {
  modalOverlay.hidden = true;
  modalBody.innerHTML = '';
  modalFooter.innerHTML = '';
  modalEl.classList.remove('modal-wide');
  activeSourceEditor = null;
}

function openModal(title, wide) {
  modalTitle.textContent = title;
  modalBody.innerHTML = '<p>Loading…</p>';
  modalFooter.innerHTML = '';
  modalEl.classList.toggle('modal-wide', Boolean(wide));
  modalOverlay.hidden = false;
}

modalCloseBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (event) => {
  if (event.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modalOverlay.hidden) closeModal();
});

function blockerListHtml(items, formatter) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(formatter(item))}</li>`).join('')}</ul>`;
}

function footerButton(label, className) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  return btn;
}

async function openDeleteColumnModal(schema, table, column) {
  openModal(`Delete column "${column}"?`);
  const res = await apiFetch(
    `/admin/v1/database/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}/delete-preview`,
  );
  if (!res) return;
  if (!res.ok) {
    modalBody.innerHTML = '<p>Failed to load column details.</p>';
    return;
  }
  const preview = await res.json();
  const blocked = preview.blockers.dependentViews.length > 0;

  let body = `<p><code>${escapeHtml(schema)}.${escapeHtml(table)}.${escapeHtml(column)}</code> — table has ~${preview.rowEstimate.toLocaleString()} row(s). This column's data will be lost.</p>`;
  if (preview.isPrimaryKey) {
    body += `<p class="banner banner-warning">${window.Icons.markup('warning', { size: 14 })} This column is part of the primary key.</p>`;
  }
  if (blocked) {
    body += `<p class="banner banner-danger">Blocked — dependent view(s) reference this column:</p>${blockerListHtml(
      preview.blockers.dependentViews,
      (v) => `${v.schema}.${v.name}`,
    )}<p>Remove or edit these views via the SQL Editor first.</p>`;
  }
  modalBody.innerHTML = body;

  const cancelBtn = footerButton('Cancel', 'btn btn-outline');
  cancelBtn.addEventListener('click', closeModal);

  const confirmBtn = footerButton('Delete column', 'btn btn-danger');
  confirmBtn.disabled = blocked;
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting…';
    const delRes = await apiFetch(
      `/admin/v1/database/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/columns/${encodeURIComponent(column)}`,
      { method: 'DELETE' },
    );
    if (!delRes) return;
    if (!delRes.ok) {
      const errBody = await delRes.json().catch(() => ({}));
      showToast(errBody.message || 'Failed to delete column', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete column';
      return;
    }
    showToast(`Column "${column}" deleted`, 'success');
    closeModal();
    loadObjects();
  });

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(confirmBtn);
}

async function openDeleteTableModal(schema, table) {
  openModal(`Delete table "${table}"?`);
  const res = await apiFetch(`/admin/v1/database/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}/delete-preview`);
  if (!res) return;
  if (!res.ok) {
    modalBody.innerHTML = '<p>Failed to load table details.</p>';
    return;
  }
  const preview = await res.json();
  const blocked = preview.blockers.dependentViews.length > 0 || preview.blockers.referencingForeignKeys.length > 0;

  let body = `<p><code>${escapeHtml(schema)}.${escapeHtml(table)}</code> — ~${preview.rowEstimate.toLocaleString()} row(s), ${preview.indexCount} index(es), ${preview.policyCount} polic${preview.policyCount === 1 ? 'y' : 'ies'}, ${preview.triggerCount} trigger(s). All will be deleted together with the table.</p>`;

  if (preview.blockers.dependentViews.length > 0) {
    body += `<p class="banner banner-danger">Blocked — dependent view(s):</p>${blockerListHtml(preview.blockers.dependentViews, (v) => `${v.schema}.${v.name}`)}`;
  }
  if (preview.blockers.referencingForeignKeys.length > 0) {
    body += `<p class="banner banner-danger">Blocked — referenced by foreign key(s) from other tables:</p>${blockerListHtml(
      preview.blockers.referencingForeignKeys,
      (fk) => `${fk.schema}.${fk.table} (${fk.constraintName})`,
    )}`;
  }
  if (blocked) {
    body += '<p>Resolve the above via the SQL Editor before deleting this table.</p>';
  }
  if (preview.functionReferences.length > 0) {
    body += `<p class="banner banner-warning">${window.Icons.markup('warning', { size: 14 })} ${preview.functionReferences.length} function(s) in this schema mention this table by name — verify before deleting, this is a text match, not a guarantee:</p>${blockerListHtml(preview.functionReferences, (fn) => fn.name)}`;
  }
  if (!blocked) {
    body += `
      <div class="field">
        <label for="confirm-table-name">Type "${escapeHtml(table)}" to confirm</label>
        <input type="text" id="confirm-table-name" autocomplete="off" />
      </div>
    `;
  }
  modalBody.innerHTML = body;

  const cancelBtn = footerButton('Cancel', 'btn btn-outline');
  cancelBtn.addEventListener('click', closeModal);

  const confirmBtn = footerButton('Delete table', 'btn btn-danger');
  confirmBtn.disabled = true;

  modalFooter.appendChild(cancelBtn);
  modalFooter.appendChild(confirmBtn);

  if (!blocked) {
    const input = document.getElementById('confirm-table-name');
    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value !== table;
    });
    input.focus();
  }

  confirmBtn.addEventListener('click', async () => {
    if (confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting…';
    const delRes = await apiFetch(`/admin/v1/database/${encodeURIComponent(schema)}/tables/${encodeURIComponent(table)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName: table }),
    });
    if (!delRes) return;
    if (!delRes.ok) {
      const errBody = await delRes.json().catch(() => ({}));
      showToast(errBody.message || 'Failed to delete table', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete table';
      return;
    }
    showToast(`Table "${table}" deleted`, 'success');
    closeModal();
    loadObjects();
  });
}

// Read-only source viewer (scope.md §29 point 1) — SQL Editor already owns function authoring,
// this never offers an edit/save control.
async function openFunctionSourceModal(schema, oid, name) {
  openModal(name, true);
  const res = await apiFetch(`/admin/v1/database/${encodeURIComponent(schema)}/functions/${encodeURIComponent(oid)}/source`);
  if (!res) return;
  if (!res.ok) {
    modalBody.innerHTML = '<p>Failed to load function source.</p>';
    return;
  }
  const source = await res.json();
  modalBody.innerHTML = '<div id="function-source-cm" class="function-source-cm"></div>';

  const closeBtn = footerButton('Close', 'btn btn-outline');
  closeBtn.addEventListener('click', closeModal);
  modalFooter.appendChild(closeBtn);

  activeSourceEditor = new EditorView({
    state: EditorState.create({
      doc: source.definition,
      extensions: [basicSetup, sql({ dialect: PostgreSQL }), EditorState.readOnly.of(true)],
    }),
    parent: document.getElementById('function-source-cm'),
  });
}

function copyButton(value) {
  return `<button type="button" class="copy-btn" data-copy-value="${escapeHtml(value)}" aria-label="Copy" title="Copy">${window.Icons.markup('copy')}</button>`;
}

// Columns are the thing read most often but can run long (wide tables) — reveal 5 at a time
// instead of dumping every row at once (Phase 14 follow-up: "don't show all cols, show 5, then
// more, more etc").
function renderColumnsSection(columns, schemaName, tableName) {
  const wrap = document.createElement('div');
  wrap.className = 'table-detail-columns';
  if (columns.length === 0) return wrap;

  const heading = document.createElement('h4');
  heading.textContent = `Columns (${columns.length})`;
  wrap.appendChild(heading);

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Name</th><th>Type</th><th>Nullable</th><th>Default</th><th></th></tr></thead>';
  const tbody = document.createElement('tbody');
  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);

  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'btn btn-outline btn-sm show-more-btn';
  wrap.appendChild(moreBtn);

  let shown = 0;
  function showMore() {
    for (const col of columns.slice(shown, shown + COLUMNS_PAGE_SIZE)) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="copyable-cell">${escapeHtml(col.name)}${copyButton(col.name)}</span></td>
        <td>${escapeHtml(col.dataType)}</td>
        <td>${col.nullable ? 'YES' : 'NO'}</td>
        <td>${col.default ? escapeHtml(col.default) : ''}</td>
        <td><button type="button" class="icon-action-btn delete-column-btn" data-schema="${escapeHtml(schemaName)}" data-table="${escapeHtml(tableName)}" data-column="${escapeHtml(col.name)}" aria-label="Delete column" title="Delete column">${window.Icons.markup('delete', { size: 12 })}</button></td>
      `;
      tbody.appendChild(tr);
    }
    shown = Math.min(shown + COLUMNS_PAGE_SIZE, columns.length);
    if (shown >= columns.length) {
      moreBtn.remove();
    } else {
      moreBtn.textContent = `Show ${Math.min(COLUMNS_PAGE_SIZE, columns.length - shown)} more (${columns.length - shown} remaining)`;
    }
  }
  moreBtn.addEventListener('click', showMore);
  showMore();

  return wrap;
}

function keysHtml(table) {
  const parts = [];
  if (table.primaryKey) {
    parts.push(`<h5>Primary key</h5><div>${escapeHtml(table.primaryKey.name)} (${table.primaryKey.columns.map(escapeHtml).join(', ')})</div>`);
  }
  if (table.uniqueConstraints.length > 0) {
    parts.push(
      `<h5>Unique constraints</h5><ul>${table.uniqueConstraints
        .map((u) => `<li>${escapeHtml(u.name)} (${u.columns.map(escapeHtml).join(', ')})</li>`)
        .join('')}</ul>`,
    );
  }
  if (table.foreignKeys.length > 0) {
    parts.push(
      `<h5>Foreign keys</h5><ul>${table.foreignKeys
        .map(
          (fk) =>
            `<li>${escapeHtml(fk.name)}: (${fk.columns.map(escapeHtml).join(', ')}) &rarr; ${escapeHtml(fk.referencesSchema)}.${escapeHtml(fk.referencesTable)} (${fk.referencesColumns.map(escapeHtml).join(', ')})</li>`,
        )
        .join('')}</ul>`,
    );
  }
  return parts.join('');
}

function indexesHtml(indexes) {
  if (indexes.length === 0) return '';
  return `<ul>${indexes.map((idx) => `<li><code>${escapeHtml(idx.definition)}</code></li>`).join('')}</ul>`;
}

function policiesHtml(policies) {
  if (policies.length === 0) return '';
  return `<ul>${policies
    .map(
      (p) =>
        `<li>${escapeHtml(p.name)} (${escapeHtml(p.command)}, roles: ${p.roles.map(escapeHtml).join(', ')})${
          p.using ? ` — using: <code>${escapeHtml(p.using)}</code>` : ''
        }${p.withCheck ? ` — with check: <code>${escapeHtml(p.withCheck)}</code>` : ''}</li>`,
    )
    .join('')}</ul>`;
}

function subAccordionItem(title, bodyHtml) {
  const item = document.createElement('div');
  item.className = 'sub-accordion-item';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'sub-accordion-header';
  header.setAttribute('aria-expanded', 'false');
  header.innerHTML = `${window.Icons.markup('chevron', { size: 12 })}<span>${escapeHtml(title)}</span>`;
  header.querySelector('.icon').classList.add('chevron');

  const body = document.createElement('div');
  body.className = 'sub-accordion-body';
  body.hidden = true;
  body.innerHTML = bodyHtml;

  item.appendChild(header);
  item.appendChild(body);
  return item;
}

// Keys/Indexes/Policies as sub-accordion sections instead of side-by-side cards (Phase 14
// follow-up: the card-grid layout read as "all in a horizontal line"). Only one section open at
// a time within a table's detail — opening one closes any other already open in that group.
function renderSubAccordion(sections) {
  const valid = sections.filter((s) => s.html);
  if (valid.length === 0) return null;

  const group = document.createElement('div');
  group.className = 'sub-accordion';
  for (const section of valid) {
    group.appendChild(subAccordionItem(section.title, section.html));
  }

  group.addEventListener('click', (event) => {
    const header = event.target.closest('.sub-accordion-header');
    if (!header) return;
    const item = header.parentElement;
    const body = item.querySelector('.sub-accordion-body');
    const wasOpen = !body.hidden;

    group.querySelectorAll('.sub-accordion-item').forEach((i) => {
      i.querySelector('.sub-accordion-body').hidden = true;
      i.querySelector('.sub-accordion-header').setAttribute('aria-expanded', 'false');
    });

    if (!wasOpen) {
      body.hidden = false;
      header.setAttribute('aria-expanded', 'true');
    }
  });

  return group;
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

  // Only ordinary/partitioned tables can be dropped this way — the backend's delete-preview
  // query only recognizes relkind 'r'/'p' (db-management.queries.ts TABLE_OID_QUERY), so views
  // never get the action rendered at all rather than surfacing a confusing 404 on click.
  const canDelete = table.kind === 'table' || table.kind === 'partitioned_table';

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
    ${
      canDelete
        ? `<button type="button" class="icon-action-btn delete-table-btn" data-schema="${escapeHtml(schemaName)}" data-table="${escapeHtml(table.name)}" aria-label="Delete table" title="Delete table">${window.Icons.markup('delete', { size: 14 })}</button>`
        : ''
    }
  `;
  header.querySelector('.icon').classList.add('chevron');

  const details = document.createElement('div');
  details.className = 'table-details';
  details.hidden = !expanded;
  details.appendChild(renderColumnsSection(table.columns, schemaName, table.name));

  const keyCount = (table.primaryKey ? 1 : 0) + table.uniqueConstraints.length + table.foreignKeys.length;
  const subAccordion = renderSubAccordion([
    { title: `Keys & constraints (${keyCount})`, html: keysHtml(table) },
    { title: `Indexes (${table.indexes.length})`, html: indexesHtml(table.indexes) },
    { title: `Policies (${table.policies.length})`, html: policiesHtml(table.policies) },
  ]);
  if (subAccordion) details.appendChild(subAccordion);

  const toggle = () => {
    const next = details.hidden;
    details.hidden = !next;
    header.setAttribute('aria-expanded', String(next));
  };
  header.addEventListener('click', (event) => {
    if (event.target.closest('.copy-btn') || event.target.closest('.delete-table-btn')) return;
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
          `<button type="button" class="function-item" data-schema="${escapeHtml(schema.name)}" data-oid="${escapeHtml(fn.oid)}" data-name="${escapeHtml(fn.name)}">${window.Icons.markup('view', { size: 12 })} ${escapeHtml(fn.name)}(${escapeHtml(fn.arguments)}) &rarr; ${escapeHtml(fn.returnType)}</button>`,
      )
      .join('')}`;
    block.appendChild(functionsBlock);
  }

  return block;
}

function renderSchemaNav(schemas) {
  // A jump strip only earns its space when there's more than one schema to jump between —
  // with the project selector now filtering down to one schema by default (Phase 14 follow-up),
  // showing it for a single result is just noise.
  if (schemas.length <= 1) {
    schemaNav.innerHTML = '';
    return;
  }
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

container.addEventListener('click', (event) => {
  const deleteColumnBtn = event.target.closest('.delete-column-btn');
  if (deleteColumnBtn) {
    openDeleteColumnModal(deleteColumnBtn.dataset.schema, deleteColumnBtn.dataset.table, deleteColumnBtn.dataset.column);
    return;
  }
  const deleteTableBtn = event.target.closest('.delete-table-btn');
  if (deleteTableBtn) {
    openDeleteTableModal(deleteTableBtn.dataset.schema, deleteTableBtn.dataset.table);
    return;
  }
  const functionItem = event.target.closest('.function-item');
  if (functionItem) {
    openFunctionSourceModal(functionItem.dataset.schema, functionItem.dataset.oid, functionItem.dataset.name);
  }
});

refreshBtn.addEventListener('click', loadObjects);
initProjectSelector(
  projectSelect,
  (schemaName) => {
    schemaFilter = schemaName;
    renderSchemas();
  },
  { allLabel: 'All schemas', optionValue: 'schemaName', initialValue: new URLSearchParams(window.location.search).get('schema') },
);
loadObjects();
