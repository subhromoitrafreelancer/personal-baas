import {
  EditorView,
  basicSetup,
  EditorState,
  javascript,
  json,
  placeholder,
  indentWithTab,
  keymap,
} from '/admin/static/js/vendor/codemirror.bundle.js';

const projectSelect = document.getElementById('project-select');
const functionList = document.getElementById('function-list');
const createFunctionForm = document.getElementById('create-function-form');
const cancelCreateFunctionBtn = document.getElementById('cancel-create-function-btn');
const newFunctionName = document.getElementById('new-function-name');
const newFunctionTimeout = document.getElementById('new-function-timeout');

const detailTitle = document.getElementById('detail-title');
const detailStatus = document.getElementById('detail-status');
const noFunctionSelected = document.getElementById('no-function-selected');
const functionDetail = document.getElementById('function-detail');
const functionTimeout = document.getElementById('function-timeout');
const saveFunctionBtn = document.getElementById('save-function-btn');
const deleteFunctionBtn = document.getElementById('delete-function-btn');
const invokeBtn = document.getElementById('invoke-btn');
const invokeResult = document.getElementById('invoke-result');
const invocationsTbody = document.getElementById('invocations-tbody');

const DEFAULT_CODE = `export default async function (ctx) {
  return { status: 200, body: { hello: ctx.auth ? ctx.auth.email : 'anonymous' } };
}
`;

// Same vendored CodeMirror 6 setup the SQL editor uses (scope.md §26 point 8 / Phase 14
// point 7), swapped to a JS/TS language mode for function source and a JSON mode for the
// test-invoke body — replaces the plain <textarea> Phase 12 shipped as a scoping cut.
const functionCodeEditor = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [basicSetup, javascript({ typescript: true }), keymap.of([indentWithTab])],
  }),
  parent: document.getElementById('function-code-cm'),
});

const invokeBodyEditor = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [
      basicSetup,
      json(),
      keymap.of([indentWithTab]),
      placeholder(document.getElementById('invoke-body-cm').dataset.placeholder || ''),
    ],
  }),
  parent: document.getElementById('invoke-body-cm'),
});

function setFunctionCode(code) {
  functionCodeEditor.dispatch({
    changes: { from: 0, to: functionCodeEditor.state.doc.length, insert: code },
  });
}

function setInvokeBody(text) {
  invokeBodyEditor.dispatch({
    changes: { from: 0, to: invokeBodyEditor.state.doc.length, insert: text },
  });
}

let currentProjectId = null;
let functions = [];
let selectedFunctionId = null;

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return null;
  }
  return response;
}

function renderFunctionRow(fn) {
  const li = document.createElement('li');
  li.className = 'function-list-item';
  if (fn.id === selectedFunctionId) li.classList.add('selected');
  li.setAttribute('role', 'button');
  li.setAttribute('tabindex', '0');
  li.innerHTML = `<span class="function-name">${escapeHtml(fn.name)}</span>`;
  li.addEventListener('click', () => selectFunction(fn.id));
  li.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectFunction(fn.id);
    }
  });
  return li;
}

async function loadFunctions() {
  const res = await apiFetch(
    `/admin/v1/functions?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res) return;
  if (!res.ok) return;
  const data = await res.json();
  functions = data.functions;
  functionList.innerHTML = '';
  for (const fn of functions) {
    functionList.appendChild(renderFunctionRow(fn));
  }
}

async function loadInvocations(id) {
  const res = await apiFetch(`/admin/v1/functions/${id}/invocations`);
  if (!res || !res.ok) return;
  const { invocations } = await res.json();
  invocationsTbody.innerHTML = '';
  for (const inv of invocations) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge status-${escapeHtml(inv.status)}">${escapeHtml(inv.status)}</span></td>
      <td>${inv.durationMs} ms</td>
      <td>${inv.error ? escapeHtml(inv.error) : '—'}</td>
      <td>${new Date(inv.invokedAt).toLocaleString()}</td>
    `;
    invocationsTbody.appendChild(tr);
  }
}

function selectFunction(id) {
  selectedFunctionId = id;
  const fn = functions.find((f) => f.id === id);
  if (!fn) return;

  detailTitle.textContent = fn.name;
  noFunctionSelected.hidden = true;
  functionDetail.hidden = false;
  setFunctionCode(fn.code);
  functionTimeout.value = fn.timeoutMs;
  invokeResult.textContent = '';
  setInvokeBody('');

  loadFunctions();
  loadInvocations(id);
}

cancelCreateFunctionBtn.addEventListener('click', () => {
  createFunctionForm.reset();
});

createFunctionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newFunctionName.value.trim();
  if (!name) return;
  const timeoutMs = newFunctionTimeout.value ? Number(newFunctionTimeout.value) : undefined;

  const res = await apiFetch('/admin/v1/functions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, code: DEFAULT_CODE, timeoutMs, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Failed to create function', 'error');
    return;
  }
  const created = await res.json();
  showToast(`Function "${created.name}" created`, 'success');
  newFunctionName.value = '';
  newFunctionTimeout.value = '';
  await loadFunctions();
  selectFunction(created.id);
});

saveFunctionBtn.addEventListener('click', async () => {
  if (!selectedFunctionId) return;
  detailStatus.textContent = 'Saving…';
  const res = await apiFetch(`/admin/v1/functions/${selectedFunctionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: functionCodeEditor.state.doc.toString(),
      timeoutMs: Number(functionTimeout.value) || undefined,
    }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    detailStatus.textContent = '';
    showToast(body.message ?? 'Failed to save function', 'error');
    return;
  }
  detailStatus.textContent = 'Saved';
  setTimeout(() => (detailStatus.textContent = ''), 1500);
  showToast('Function saved', 'success');
  loadFunctions();
});

// Deleting a function cascades to any Scheduler job pointing at it (scheduler.scheduled_jobs.
// function_id references functions.functions(id) ON DELETE CASCADE) — that's real blast radius,
// not just an annoyance, so it's surfaced as a blocking-strength warning even though the delete
// itself is still allowed to proceed (matching Database Explorer's "text match, not a guarantee"
// framing for a heads-up that doesn't outright block).
async function referencingJobs(functionId) {
  const res = await apiFetch(
    `/admin/v1/scheduler/jobs?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res || !res.ok) return [];
  const { jobs: allJobs } = await res.json();
  return allJobs.filter((job) => job.functionId === functionId);
}

deleteFunctionBtn.addEventListener('click', async () => {
  if (!selectedFunctionId) return;
  const fn = functions.find((f) => f.id === selectedFunctionId);
  if (!fn) return;
  const jobs = await referencingJobs(fn.id);

  ConfirmModal.confirmDelete(`Delete function "${fn.name}"?`, {
    bodyHtml: `<p>This deletes the function's code and its entire invocation history.</p>`,
    warnings: [
      {
        label: `${jobs.length} scheduled job(s) target this function and will be deleted along with it:`,
        items: jobs,
        formatter: (job) => `${job.name} (${job.cronExpression})`,
      },
    ],
    confirmLabel: 'Delete function',
    onConfirm: async () => {
      const res = await apiFetch(`/admin/v1/functions/${selectedFunctionId}`, { method: 'DELETE' });
      if (!res) return { ok: false };
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, message: body.message ?? 'Failed to delete function' };
      }
      showToast(`Function "${fn.name}" deleted`, 'success');
      selectedFunctionId = null;
      functionDetail.hidden = true;
      noFunctionSelected.hidden = false;
      detailTitle.textContent = 'Select a function';
      loadFunctions();
      return { ok: true };
    },
  });
});

invokeBtn.addEventListener('click', async () => {
  if (!selectedFunctionId) return;
  const bodyText = invokeBodyEditor.state.doc.toString().trim();
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    invokeResult.textContent = 'Invalid JSON body';
    return;
  }
  invokeResult.textContent = 'Invoking…';
  const res = await apiFetch(`/admin/v1/functions/${selectedFunctionId}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res) return;
  const result = await res.json().catch(() => ({}));
  invokeResult.textContent = JSON.stringify(result, null, 2);
  loadInvocations(selectedFunctionId);
});

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  selectedFunctionId = null;
  functionDetail.hidden = true;
  noFunctionSelected.hidden = false;
  detailTitle.textContent = 'Select a function';
  loadFunctions();
});
