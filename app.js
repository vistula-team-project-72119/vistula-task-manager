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
const refreshButton = document.getElementById('refresh-tasks');

let config = null;
let tasks = [];
let editingId = null;
let busy = false;
let initialized = false;

// Display status messages
function status(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = type;
}

// Load Supabase configuration
async function loadConfig() {
  const response = await fetch('./config.json', {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(
      `Could not load config.json (HTTP ${response.status})`
    );
  }

  const data = await response.json();

  if (
    !data.supabaseUrl ||
    !data.supabasePublishableKey ||
    data.tableName !== 'tasks'
  ) {
    throw new Error('Invalid public Supabase configuration');
  }

  config = data;
  initialized = true;
}

// Supabase REST API
async function api(method, query = '', body) {
  if (!initialized || !config) {
    throw new Error('Supabase configuration is not loaded yet');
  }

  const baseUrl = config.supabaseUrl.replace(/\/$/, '');

  const url =
    `${baseUrl}/rest/v1/` +
    `${encodeURIComponent(config.tableName)}${query}`;

  const headers = {
    apikey: config.supabasePublishableKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  if (body !== undefined) {
    headers.Prefer = 'return=representation';
  }

  const options = {
    method,
    headers
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    let details = `HTTP ${response.status}`;

    try {
      const data = await response.json();
      details = data.message || data.error || details;
    } catch {
      // Response was not JSON
    }

    throw new Error(details);
  }

  if (response.status === 204) {
    return null;
  }

  const content = await response.text();

  return content ? JSON.parse(content) : null;
}

// Create action buttons
function button(label, className, handler) {
  const element = document.createElement('button');

  element.type = 'button';
  element.className = className;
  element.textContent = label;
  element.disabled = busy;

  element.addEventListener('click', handler);

  return element;
}

// Render task list
function render() {
  taskList.replaceChildren();

  taskCount.textContent = String(tasks.length);

  if (tasks.length === 0) {
    const empty = document.createElement('p');

    empty.className = 'empty';
    empty.textContent =
      'No tasks yet. Create your first task above.';

    taskList.append(empty);
    return;
  }

  for (const task of tasks) {
    const item = document.createElement('article');

    item.className =
      `task-item${task.completed ? ' is-complete' : ''}`;

    item.dataset.id = String(task.id);

    const top = document.createElement('div');
    top.className = 'task-top';

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title;

    const state = document.createElement('span');
    state.className = 'task-status';

    state.textContent = task.completed
      ? '✓ Completed'
      : '○ In progress';

    top.append(title, state);

    const description = document.createElement('p');
    description.className = 'task-description';

    description.textContent =
      task.description || 'No description';

    const actions = document.createElement('div');
    actions.className = 'task-actions';

    actions.append(
      button(
        task.completed
          ? 'Mark incomplete'
          : 'Mark complete',
        'toggle-task secondary',
        () => changeTask(task.id, {
          completed: !task.completed
        })
      ),

      button(
        'Edit',
        'edit-task secondary',
        () => startEdit(task)
      ),

      button(
        'Delete',
        'delete-task danger',
        () => deleteTask(task.id)
      )
    );

    item.append(top, description, actions);
    taskList.append(item);
  }
}

// Disable controls during API operations
function setBusy(value) {
  busy = value;

  submitButton.disabled = value || !initialized;
  cancelButton.disabled = value;
  refreshButton.disabled = value || !initialized;

  taskList.querySelectorAll('button').forEach(element => {
    element.disabled = value;
  });
}

// Fetch tasks from Supabase
async function loadTasks() {
  if (!initialized || !config) {
    status(
      'Configuration is loading. Please wait...',
      'error'
    );
    return;
  }

  if (busy) {
    return;
  }

  setBusy(true);
  status('Loading tasks…');

  try {
    const result = await api(
      'GET',
      '?select=*&order=id.desc'
    );

    tasks = Array.isArray(result) ? result : [];

    render();

    status(
      `Loaded ${tasks.length} task${
        tasks.length === 1 ? '' : 's'
      }.`,
      'success'
    );
  } catch (error) {
    status(
      `Could not load tasks: ${error.message}`,
      'error'
    );
  } finally {
    setBusy(false);
  }
}

// Reset task form
function resetForm() {
  editingId = null;

  form.reset();

  formHeading.textContent = 'Create a task';
  submitButton.textContent = 'Add task';
  cancelButton.hidden = true;
}

// Start editing a task
function startEdit(task) {
  if (busy) return;

  editingId = task.id;

  titleInput.value = task.title;
  descriptionInput.value = task.description || '';

  formHeading.textContent = `Edit task #${task.id}`;
  submitButton.textContent = 'Save changes';
  cancelButton.hidden = false;

  titleInput.focus();

  form.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
}

// Update task
async function changeTask(id, changes) {
  if (busy) return;

  setBusy(true);

  try {
    await api(
      'PATCH',
      `?id=eq.${encodeURIComponent(id)}`,
      changes
    );

    const result = await api(
      'GET',
      '?select=*&order=id.desc'
    );

    tasks = Array.isArray(result) ? result : [];

    render();

    status('Task updated successfully.', 'success');
  } catch (error) {
    status(
      `Could not update task: ${error.message}`,
      'error'
    );
  } finally {
    setBusy(false);
  }
}

// Delete task
async function deleteTask(id) {
  if (busy) return;

  if (!window.confirm('Delete this task?')) {
    return;
  }

  setBusy(true);

  try {
    await api(
      'DELETE',
      `?id=eq.${encodeURIComponent(id)}`
    );

    if (editingId === id) {
      resetForm();
    }

    const result = await api(
      'GET',
      '?select=*&order=id.desc'
    );

    tasks = Array.isArray(result) ? result : [];

    render();

    status('Task deleted successfully.', 'success');
  } catch (error) {
    status(
      `Could not delete task: ${error.message}`,
      'error'
    );
  } finally {
    setBusy(false);
  }
}

// Create or edit task
form.addEventListener('submit', async event => {
  event.preventDefault();

  if (busy || !initialized) {
    return;
  }

  const title = titleInput.value.trim();

  if (!title) {
    status('Please enter a task title.', 'error');
    titleInput.focus();
    return;
  }

  const payload = {
    title,
    description: descriptionInput.value.trim()
  };

  const wasEditing = editingId !== null;

  setBusy(true);

  try {
    if (wasEditing) {
      await api(
        'PATCH',
        `?id=eq.${encodeURIComponent(editingId)}`,
        payload
      );
    } else {
      await api('POST', '', payload);
    }

    const result = await api(
      'GET',
      '?select=*&order=id.desc'
    );

    tasks = Array.isArray(result) ? result : [];

    resetForm();
    render();

    status(
      wasEditing
        ? 'Task saved successfully.'
        : 'Task added successfully.',
      'success'
    );
  } catch (error) {
    status(
      `Could not save task: ${error.message}`,
      'error'
    );
  } finally {
    setBusy(false);
  }
});

// Cancel editing
cancelButton.addEventListener('click', () => {
  if (!busy) {
    resetForm();
  }
});

// Refresh task list
refreshButton.addEventListener('click', loadTasks);

// Initialize application
async function initializeApp() {
  setBusy(true);

  status('Connecting to Supabase…');

  try {
    await loadConfig();

    setBusy(false);

    await loadTasks();
  } catch (error) {
    initialized = false;
    config = null;

    setBusy(false);

    status(
      `Setup error: ${error.message}`,
      'error'
    );
  }
}

// Start application
initializeApp();
