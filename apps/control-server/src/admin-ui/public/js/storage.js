const bucketList = document.getElementById('bucket-list');
const createBucketBtn = document.getElementById('create-bucket-btn');
const createBucketForm = document.getElementById('create-bucket-form');
const cancelCreateBucketBtn = document.getElementById('cancel-create-bucket-btn');
const newBucketName = document.getElementById('new-bucket-name');
const newBucketPublic = document.getElementById('new-bucket-public');
const newBucketSizeLimit = document.getElementById('new-bucket-size-limit');

const objectPanelTitle = document.getElementById('object-panel-title');
const objectsStatus = document.getElementById('objects-status');
const noBucketSelected = document.getElementById('no-bucket-selected');
const uploadForm = document.getElementById('upload-form');
const uploadFile = document.getElementById('upload-file');
const uploadPath = document.getElementById('upload-path');
const objectsTable = document.getElementById('objects-table');
const objectsTbody = document.getElementById('objects-tbody');
const projectSelect = document.getElementById('project-select');

let selectedBucket = null;
let currentProjectId = null;

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function objectUrl(bucketName, path) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `/admin/v1/storage/buckets/${encodeURIComponent(bucketName)}/objects/${encodedPath}?projectId=${encodeURIComponent(currentProjectId)}`;
}

async function apiFetch(url, options) {
  const response = await fetch(url, options);
  if (response.status === 401) {
    window.location.href = '/admin/login';
    return null;
  }
  return response;
}

function renderBucketRow(bucket) {
  const li = document.createElement('li');
  li.className = 'bucket-list-item';
  if (bucket.name === selectedBucket) li.classList.add('selected');
  li.innerHTML = `
    <span class="bucket-name">${escapeHtml(bucket.name)}</span>
    ${bucket.public ? '<span class="badge status-active">public</span>' : '<span class="badge">private</span>'}
  `;
  li.addEventListener('click', () => selectBucket(bucket.name));
  return li;
}

async function loadBuckets() {
  const res = await apiFetch(`/admin/v1/storage/buckets?projectId=${encodeURIComponent(currentProjectId)}`);
  if (!res) return;
  if (!res.ok) return;
  const { buckets } = await res.json();
  bucketList.innerHTML = '';
  for (const bucket of buckets) {
    bucketList.appendChild(renderBucketRow(bucket));
  }
}

function renderObjectRow(bucketName, object) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${escapeHtml(object.path)}</td>
    <td>${Number(object.size).toLocaleString()} B</td>
    <td>${escapeHtml(object.contentType ?? '—')}</td>
    <td>${object.owner ? escapeHtml(object.owner) : '—'}</td>
    <td>${new Date(object.createdAt).toLocaleString()}</td>
    <td class="actions-cell">
      <a class="btn btn-outline btn-sm" href="${objectUrl(bucketName, object.path)}" download="${escapeHtml(object.path)}">Download</a>
      <button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>
    </td>
  `;
  tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Delete "${object.path}"?`)) return;
    const res = await apiFetch(objectUrl(bucketName, object.path), { method: 'DELETE' });
    if (res?.ok) loadObjects(bucketName);
  });
  return tr;
}

async function loadObjects(bucketName) {
  objectsStatus.textContent = 'Loading…';
  const res = await apiFetch(
    `/admin/v1/storage/buckets/${encodeURIComponent(bucketName)}/objects?projectId=${encodeURIComponent(currentProjectId)}`,
  );
  if (!res) return;
  if (!res.ok) {
    objectsStatus.textContent = 'Failed to load objects';
    return;
  }
  const { objects } = await res.json();
  objectsTbody.innerHTML = '';
  for (const object of objects) {
    objectsTbody.appendChild(renderObjectRow(bucketName, object));
  }
  objectsStatus.textContent = `${objects.length} object(s)`;
}

function selectBucket(bucketName) {
  selectedBucket = bucketName;
  objectPanelTitle.textContent = `Objects — ${bucketName}`;
  noBucketSelected.hidden = true;
  uploadForm.hidden = false;
  objectsTable.hidden = false;
  loadBuckets();
  loadObjects(bucketName);
}

createBucketBtn.addEventListener('click', () => {
  createBucketForm.hidden = false;
});
cancelCreateBucketBtn.addEventListener('click', () => {
  createBucketForm.hidden = true;
});

createBucketForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = newBucketName.value.trim();
  if (!name) return;
  const sizeLimitBytes = newBucketSizeLimit.value ? Number(newBucketSizeLimit.value) : null;

  const res = await apiFetch('/admin/v1/storage/buckets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, public: newBucketPublic.checked, sizeLimitBytes, projectId: currentProjectId }),
  });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.message ?? 'Failed to create bucket');
    return;
  }
  createBucketForm.hidden = true;
  newBucketName.value = '';
  newBucketPublic.checked = false;
  newBucketSizeLimit.value = '';
  loadBuckets();
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedBucket) return;
  const file = uploadFile.files[0];
  const path = uploadPath.value.trim().replace(/^\/+/, '');
  if (!file || !path) return;

  const formData = new FormData();
  formData.append('file', file);

  const res = await apiFetch(objectUrl(selectedBucket, path), { method: 'POST', body: formData });
  if (!res) return;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.message ?? 'Failed to upload object');
    return;
  }
  uploadFile.value = '';
  uploadPath.value = '';
  loadObjects(selectedBucket);
});

function resetObjectPanel() {
  selectedBucket = null;
  objectPanelTitle.textContent = 'Objects';
  noBucketSelected.hidden = false;
  uploadForm.hidden = true;
  objectsTable.hidden = true;
  objectsTbody.innerHTML = '';
  objectsStatus.textContent = '';
}

initProjectSelector(projectSelect, (projectId) => {
  currentProjectId = projectId;
  // A bucket selected under the previous project has no meaning under the new one — buckets
  // are project-scoped (Phase 10, scope.md §24), not just filtered by name.
  resetObjectPanel();
  loadBuckets();
});
