const projectSelect = document.getElementById('project-select');
const jobList = document.getElementById('job-list');
const createJobForm = document.getElementById('create-job-form');
const cancelCreateJobBtn = document.getElementById('cancel-create-job-btn');
const newJobName = document.getElementById('new-job-name');
const newJobFunction = document.getElementById('new-job-function');
const newJobCron = document.getElementById('new-job-cron');

const detailTitle = document.getElementById('detail-title');
const detailStatus = document.getElementById('detail-status');
const noJobSelected = document.getElementById('no-job-selected');
const jobDetail = document.getElementById('job-detail');
const jobFunctionSelect = document.getElementById('job-function');
const jobCronInput = document.getElementById('job-cron');
const jobEnabledInput = document.getElementById('job-enabled');
const jobScheduleInfo = document.getElementById('job-schedule-info');
const saveJobBtn = document.getElementById('save-job-btn');
const runNowBtn = document.getElementById('run-now-btn');
const deleteJobBtn = document.getElementById('delete-job-btn');
const runsTbody = document.getElementById('runs-tbody');

let currentProjectId = null;
let jobs = [];
let projectFunctions = [];
let selectedJobId = null;

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

function functionName(id) {
  const fn = projectFunctions.find((f) => f.id === id);
  return fn ? fn.name : '(deleted function)';
}

function populateFunctionSelect(selectEl, selectedId) {
  selectEl.innerHTML = '';
  for (const fn of projectFunctions) {
    const option = document.createElement('option');
    option.value = fn.id;
    option.textContent = fn.name;
    option.selected = fn.id === selectedId;
    selectEl.appendChild(option);
  }
}

async function loadFunctionsForProject() {
  const res = await apiFetch(
    `/admin/v1/functions?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res || !res.ok) return;
  const data = await res.json();
  projectFunctions = data.functions;
  populateFunctionSelect(newJobFunction, null);
}

function renderJobRow(job) {
  const li = document.createElement('li');
  li.className = 'function-list-item';
  if (job.id === selectedJobId) li.classList.add('selected');
  li.innerHTML = `<span class="function-name">${escapeHtml(job.name)}</span><span class="badge">${job.enabled ? 'enabled' : 'disabled'}</span>`;
  li.addEventListener('click', () => selectJob(job.id));
  return li;
}

async function loadJobs() {
  const res = await apiFetch(
    `/admin/v1/scheduler/jobs?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res || !res.ok) return;
  const data = await res.json();
  jobs = data.jobs;
  jobList.innerHTML = '';
  for (const job of jobs) {
    jobList.appendChild(renderJobRow(job));
  }
}

async function loadRuns(id) {
  const res = await apiFetch(`/admin/v1/scheduler/jobs/${id}/runs`);
  if (!res || !res.ok) return;
  const { runs } = await res.json();
  runsTbody.innerHTML = '';
  for (const run of runs) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge">${escapeHtml(run.status ?? 'running')}</span></td>
      <td>${new Date(run.startedAt).toLocaleString()}</td>
      <td>${run.finishedAt ? new Date(run.finishedAt).toLocaleString() : '—'}</td>
      <td>${run.error ? escapeHtml(run.error) : '—'}</td>
    `;
    runsTbody.appendChild(tr);
  }
}

function selectJob(id) {
  selectedJobId = id;
  const job = jobs.find((j) => j.id === id);
  if (!job) return;

  detailTitle.textContent = job.name;
  noJobSelected.hidden = true;
  jobDetail.hidden = false;
  populateFunctionSelect(jobFunctionSelect, job.functionId);
  jobCronInput.value = job.cronExpression;
  jobEnabledInput.checked = job.enabled;
  jobScheduleInfo.textContent =
    `Function: ${functionName(job.functionId)} — ` +
    `Next run: ${job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—'} — ` +
    `Last run: ${job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : '—'}` +
    (job.lastStatus ? ` (${job.lastStatus})` : '');

  loadJobs();
  loadRuns(id);
}

cancelCreateJobBtn.addEventListener('click', () => {
  createJobForm.reset();
});

createJobForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newJobName.value.trim();
  const functionId = newJobFunction.value;
  const cronExpression = newJobCron.value.trim();
  if (!name || !functionId || !cronExpression) return;

  const res = await apiFetch('/admin/v1/scheduler/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, functionId, cronExpression, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Failed to create job', 'error');
    return;
  }
  const created = await res.json();
  showToast(`Job "${created.name}" created`, 'success');
  newJobName.value = '';
  newJobCron.value = '';
  await loadJobs();
  selectJob(created.id);
});

saveJobBtn.addEventListener('click', async () => {
  if (!selectedJobId) return;
  detailStatus.textContent = 'Saving…';
  const res = await apiFetch(`/admin/v1/scheduler/jobs/${selectedJobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      functionId: jobFunctionSelect.value,
      cronExpression: jobCronInput.value.trim(),
      enabled: jobEnabledInput.checked,
    }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    detailStatus.textContent = '';
    showToast(body.message ?? 'Failed to save job', 'error');
    return;
  }
  detailStatus.textContent = 'Saved';
  setTimeout(() => (detailStatus.textContent = ''), 1500);
  showToast('Job saved', 'success');
  await loadJobs();
  selectJob(selectedJobId);
});

runNowBtn.addEventListener('click', async () => {
  if (!selectedJobId) return;
  detailStatus.textContent = 'Running…';
  const res = await apiFetch(`/admin/v1/scheduler/jobs/${selectedJobId}/run-now`, {
    method: 'POST',
  });
  if (!res) return;
  detailStatus.textContent = '';
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Failed to run job', 'error');
    return;
  }
  showToast('Job run started', 'success');
  // The run itself is async on the server; give it a moment before refreshing history/status.
  setTimeout(() => {
    loadJobs();
    loadRuns(selectedJobId);
  }, 1000);
});

deleteJobBtn.addEventListener('click', async () => {
  if (!selectedJobId) return;
  const job = jobs.find((j) => j.id === selectedJobId);
  if (!confirm(`Delete scheduled job "${job ? job.name : selectedJobId}"?`)) return;
  const res = await apiFetch(`/admin/v1/scheduler/jobs/${selectedJobId}`, { method: 'DELETE' });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showToast(body.message ?? 'Failed to delete job', 'error');
    return;
  }
  showToast(`Job "${job ? job.name : ''}" deleted`, 'success');
  selectedJobId = null;
  jobDetail.hidden = true;
  noJobSelected.hidden = false;
  detailTitle.textContent = 'Select a job';
  loadJobs();
});

initProjectSelector(projectSelect, async (projectId) => {
  currentProjectId = projectId;
  selectedJobId = null;
  jobDetail.hidden = true;
  noJobSelected.hidden = false;
  detailTitle.textContent = 'Select a job';
  await loadFunctionsForProject();
  loadJobs();
});
