'use strict';

const form = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const descriptionInput = document.getElementById('task-description');
const submitButton = document.getElementById('task-submit');
const cancelButton = document.getElementById('cancel-edit');
const taskList = document.getElementById('task-list');
const statusMessage = document.getElementById('status-message');
const taskCount = document.getElementById('task-count');
const formHeading = document.getElementById('form-heading');
let config;
let tasks = [];
let editingId = null;
let busy = false;

function status(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = type;
}

async function api(method, query = '', body) {
  const url = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(config.tableName)}${query}`;
  const headers = {
    apikey: config.supabasePublishableKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
  if (body !== undefined) headers.Prefer = 'return=representation';
  const response = await fetch(url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    let details = `HTTP ${response.status}`;
    try { const data = await response.json(); details = data.message || data.error || details; } catch { /* response was not JSON */ }
    throw new Error(details);
  }
  if (response.status === 204) return null;
  const content = await response.text();
  return content ? JSON.parse(content) : null;
}

function button(label, className, handler) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.disabled = busy;
  element.addEventListener('click', handler);
  return element;
}

function render() {
  taskList.replaceChildren();
  taskCount.textContent = String(tasks.length);
  if (tasks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No tasks yet. Create your first task above.';
    taskList.append(empty);
    return;
  }
  for (const task of tasks) {
    const item = document.createElement('article');
    item.className = `task-item${task.completed ? ' is-complete' : ''}`;
    item.dataset.id = String(task.id);
    const top = document.createElement('div');
    top.className = 'task-top';
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;
    const state = document.createElement('span');
    state.className = 'task-status';
    state.textContent = task.completed ? '✓ Completed' : '○ In progress';
    top.append(title, state);
    const description = document.createElement('p');
    description.className = 'task-description';
    description.textContent = task.description || 'No description';
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    actions.append(
      button(task.completed ? 'Mark incomplete' : 'Mark complete', 'toggle-task secondary', () => changeTask(task.id, { completed: !task.completed })),
      button('Edit', 'edit-task secondary', () => startEdit(task)),
      button('Delete', 'delete-task danger', () => deleteTask(task.id))
    );
    item.append(top, description, actions);
    taskList.append(item);
  }
}

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  cancelButton.disabled = value;
  document.getElementById('refresh-tasks').disabled = value;
  taskList.querySelectorAll('button').forEach(el => { el.disabled = value; });
}

async function loadTasks() {
  setBusy(true);
  status('Loading tasks…');
  try {
    tasks = await api('GET', '?select=*&order=id.desc');
    render();
    status(`Loaded ${tasks.length} task${tasks.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    status(`Could not load tasks: ${error.message}`, 'error');
  } finally { setBusy(false); }
}

function resetForm() {
  editingId = null;
  form.reset();
  formHeading.textContent = 'Create a task';
  submitButton.textContent = 'Add task';
  cancelButton.hidden = true;
}

function startEdit(task) {
  editingId = task.id;
  titleInput.value = task.title;
  descriptionInput.value = task.description || '';
  formHeading.textContent = `Edit task #${task.id}`;
  submitButton.textContent = 'Save changes';
  cancelButton.hidden = false;
  titleInput.focus();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function changeTask(id, changes) {
  setBusy(true);
  try {
    await api('PATCH', `?id=eq.${encodeURIComponent(id)}`, changes);
    await loadTasks();
    status('Task updated successfully.', 'success');
  } catch (error) { status(`Could not update task: ${error.message}`, 'error'); }
  finally { setBusy(false); }
}

async function deleteTask(id) {
  if (!window.confirm('Delete this task?')) return;
  setBusy(true);
  try {
    await api('DELETE', `?id=eq.${encodeURIComponent(id)}`);
    if (editingId === id) resetForm();
    await loadTasks();
    status('Task deleted successfully.', 'success');
  } catch (error) { status(`Could not delete task: ${error.message}`, 'error'); }
  finally { setBusy(false); }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) { status('Please enter a task title.', 'error'); titleInput.focus(); return; }
  const payload = { title, description: descriptionInput.value.trim() };
  const wasEditing = editingId !== null;
  setBusy(true);
  try {
    if (wasEditing) await api('PATCH', `?id=eq.${encodeURIComponent(editingId)}`, payload);
    else await api('POST', '', payload);
    resetForm();
    await loadTasks();
    status(wasEditing ? 'Task saved successfully.' : 'Task added successfully.', 'success');
  } catch (error) { status(`Could not save task: ${error.message}`, 'error'); }
  finally { setBusy(false); }
});

cancelButton.addEventListener('click', resetForm);
document.getElementById('refresh-tasks').addEventListener('click', loadTasks);

(async () => {
  try {
    const response = await fetch('config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load config.json (HTTP ${response.status})`);
    config = await response.json();
    if (!config.supabaseUrl || !config.supabasePublishableKey || config.tableName !== 'tasks') throw new Error('Invalid public Supabase configuration');
    await loadTasks();
  } catch (error) { status(`Setup error: ${error.message}`, 'error'); submitButton.disabled = true; }
})();
