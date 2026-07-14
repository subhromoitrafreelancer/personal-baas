import {
  EditorView,
  basicSetup,
  EditorState,
  sql,
  PostgreSQL,
  indentWithTab,
  keymap,
} from '/admin/static/js/vendor/codemirror.bundle.js';

const editor = new EditorView({
  state: EditorState.create({
    doc: '',
    extensions: [basicSetup, sql({ dialect: PostgreSQL }), keymap.of([indentWithTab])],
  }),
  parent: document.getElementById('sql-editor-cm'),
});

const runStatementBtn = document.getElementById('run-statement-btn');
const runScriptBtn = document.getElementById('run-script-btn');
const cancelBtn = document.getElementById('cancel-btn');
const rowLimitInput = document.getElementById('row-limit-input');
const runStatus = document.getElementById('run-status');
const errorBox = document.getElementById('sql-error');
const resultsBox = document.getElementById('sql-results');
const toggleHistoryBtn = document.getElementById('toggle-history-btn');
const refreshHistoryBtn = document.getElementById('refresh-history-btn');
const historyPanel = document.getElementById('history-panel');
const historyList = document.getElementById('history-list');
const uploadBtn = document.getElementById('upload-btn');
const sqlFileInput = document.getElementById('sql-file-input');

let currentExecutionId = null;

function getEditorText() {
  const { from, to } = editor.state.selection.main;
  const selected = editor.state.sliceDoc(from, to);
  return selected.trim().length > 0 ? selected : editor.state.doc.toString();
}

function setRunning(isRunning) {
  runStatementBtn.disabled = isRunning;
  runScriptBtn.disabled = isRunning;
  cancelBtn.hidden = !isRunning;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(fields, rows, filename) {
  const lines = [fields.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(fields.map((f) => csvEscape(row[f])).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderStatementResult(statement, index) {
  const block = document.createElement('div');
  block.className = 'result-block';

  const header = document.createElement('div');
  header.className = 'result-block-header';
  const rowCountLabel = statement.rowCount === null ? 'no row count' : `${statement.rowCount} row(s) affected`;
  header.innerHTML = `<span>#${index + 1}: ${escapeHtml(statement.text)}</span><span>${rowCountLabel}${
    statement.truncated ? ' (truncated)' : ''
  } — ${statement.durationMs}ms</span>`;

  if (statement.rows.length > 0) {
    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = 'Export CSV';
    exportBtn.addEventListener('click', () =>
      downloadCsv(statement.fields, statement.rows, `query-result-${index + 1}.csv`),
    );
    header.appendChild(exportBtn);
  }

  block.appendChild(header);

  if (statement.rows.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'result-table-wrap';
    const table = document.createElement('table');
    table.className = 'result-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${statement.fields.map((f) => `<th>${escapeHtml(f)}</th>`).join('')}</tr>`;
    const tbody = document.createElement('tbody');
    for (const row of statement.rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = statement.fields
        .map((f) => `<td>${escapeHtml(row[f] === null ? 'NULL' : JSON.stringify(row[f]))}</td>`)
        .join('');
      tbody.appendChild(tr);
    }
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    block.appendChild(wrap);
  }

  return block;
}

function renderResults(statements) {
  resultsBox.innerHTML = '';
  statements.forEach((statement, index) => {
    resultsBox.appendChild(renderStatementResult(statement, index));
  });
}

function renderError(error) {
  errorBox.hidden = false;
  const location =
    error.line !== undefined && error.position !== undefined ? ` (line ${error.line}, column ${error.position})` : '';
  errorBox.textContent = `Statement #${error.statementIndex + 1} failed${location}: ${error.message}`;
}

async function handleExecuteResponse(response, startedAt) {
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return;
  }

  const body = await response.json();

  if (response.ok) {
    renderResults(body.statements);
    runStatus.textContent = `Completed in ${body.totalDurationMs}ms`;
    loadHistory();
  } else if (response.status === 422 && body.error) {
    renderResults(body.statements ?? []);
    renderError(body.error);
    runStatus.textContent = `Failed after ${body.totalDurationMs}ms`;
    loadHistory();
  } else {
    errorBox.hidden = false;
    errorBox.textContent =
      typeof body.message === 'string' ? body.message : JSON.stringify(body.message ?? 'Request failed');
    runStatus.textContent = '';
  }
}

async function runRequest(sendRequest) {
  errorBox.hidden = true;
  errorBox.textContent = '';
  runStatus.textContent = 'Running…';
  setRunning(true);

  const executionId = crypto.randomUUID();
  currentExecutionId = executionId;
  const startedAt = performance.now();

  try {
    const response = await sendRequest(executionId);
    await handleExecuteResponse(response, startedAt);
  } catch (err) {
    errorBox.hidden = false;
    errorBox.textContent = err instanceof Error ? err.message : 'Request failed';
  } finally {
    runStatus.textContent = runStatus.textContent || `${Math.round(performance.now() - startedAt)}ms`;
    setRunning(false);
    if (currentExecutionId === executionId) {
      currentExecutionId = null;
    }
  }
}

function runSql(mode) {
  const sqlText = mode === 'script' ? editor.state.doc.toString() : getEditorText();
  if (!sqlText.trim()) {
    return;
  }
  return runRequest((executionId) =>
    fetch('/admin/v1/sql/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sql: sqlText,
        mode,
        rowLimit: Number(rowLimitInput.value) || undefined,
        executionId,
      }),
    }),
  );
}

runStatementBtn.addEventListener('click', () => runSql('statement'));
runScriptBtn.addEventListener('click', () => runSql('script'));

uploadBtn.addEventListener('click', () => sqlFileInput.click());

sqlFileInput.addEventListener('change', () => {
  const file = sqlFileInput.files[0];
  sqlFileInput.value = '';
  if (!file) return;

  runRequest((executionId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('executionId', executionId);
    if (Number(rowLimitInput.value)) {
      formData.append('rowLimit', rowLimitInput.value);
    }
    return fetch('/admin/v1/sql/upload', { method: 'POST', body: formData });
  });
});

cancelBtn.addEventListener('click', async () => {
  if (!currentExecutionId) return;
  runStatus.textContent = 'Cancelling…';
  await fetch('/admin/v1/sql/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ executionId: currentExecutionId }),
  });
});

function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString();
}

async function loadHistory() {
  const response = await fetch('/admin/v1/sql/history?limit=50');
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return;
  }
  if (!response.ok) return;

  const { items } = await response.json();
  historyList.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `history-item${item.success ? '' : ' failed'}`;
    li.innerHTML = `
      <div class="history-sql">${escapeHtml(item.sql)}</div>
      <div class="history-meta">
        <span>${formatTimestamp(item.executedAt)}</span>
        <span>${item.durationMs}ms</span>
        <span>${item.mode}</span>
      </div>
    `;
    li.addEventListener('click', () => {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: item.sql },
      });
    });
    historyList.appendChild(li);
  }
}

toggleHistoryBtn.addEventListener('click', () => {
  historyPanel.hidden = !historyPanel.hidden;
  if (!historyPanel.hidden) {
    loadHistory();
  }
});

refreshHistoryBtn.addEventListener('click', loadHistory);
