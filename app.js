const STORAGE_KEY = 'dailyWorkLog.v1';
const COLOR_OPTIONS = ['#6f5cff', '#ef6b73', '#2c9c70', '#3f86e8', '#dc8b2b', '#9857c9', '#1d9aa6', '#5d6b7f'];

const todayISO = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const escapeHTML = (value = '') => value.replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const defaultState = () => ({
  projects: [{
    id: 'project_general',
    name: 'General',
    description: 'Work that does not belong to a specific project yet.',
    color: COLOR_OPTIONS[0],
    createdAt: new Date().toISOString()
  }],
  tasks: [],
  entries: [],
  reviews: []
});

let state = loadState();
let currentTaskFilter = 'open';
let selectedProjectColor = COLOR_OPTIONS[0];
let deferredInstallPrompt = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.projects) || !Array.isArray(saved.tasks) || !Array.isArray(saved.entries)) {
      return defaultState();
    }
    saved.reviews = Array.isArray(saved.reviews) ? saved.reviews : [];
    return saved;
  } catch {
    return defaultState();
  }
}

function saveState(message) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  if (message) showToast(message);
}

function projectById(id) {
  return state.projects.find(project => project.id === id) || state.projects[0];
}

function formatDate(dateString, options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dateString}T12:00:00`));
}

function formatShortDate(dateString) {
  return formatDate(dateString, { month: 'short', day: 'numeric' });
}

function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function setSelectOptions(select, { includeAll = false, selectedValue } = {}) {
  const options = [];
  if (includeAll) options.push('<option value="all">All projects</option>');
  state.projects.forEach(project => {
    options.push(`<option value="${project.id}">${escapeHTML(project.name)}</option>`);
  });
  select.innerHTML = options.join('');
  if (selectedValue && [...select.options].some(option => option.value === selectedValue)) {
    select.value = selectedValue;
  }
}

function renderAll() {
  renderProjectSelects();
  renderToday();
  renderTasks();
  renderProjects();
  renderHistory();
  renderStorageSummary();
}

function renderProjectSelects() {
  const selects = [
    ['entryProject', false],
    ['taskProject', false],
    ['taskProjectFilter', true],
    ['historyProjectFilter', true]
  ];
  selects.forEach(([id, includeAll]) => {
    const el = document.getElementById(id);
    const current = el.value;
    setSelectOptions(el, { includeAll, selectedValue: current });
  });
}

function renderToday() {
  const today = todayISO();
  document.getElementById('todayLongDate').textContent = formatDate(today);

  const entries = state.entries
    .filter(entry => entry.date === today)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  document.getElementById('todayEntryCount').textContent = plural(entries.length, 'entry');
  document.getElementById('statEntries').textContent = entries.length;
  document.getElementById('statProjects').textContent = new Set(entries.map(entry => entry.projectId)).size;
  document.getElementById('statTasks').textContent = state.tasks.filter(task => task.status !== 'completed').length;

  const entriesHost = document.getElementById('todayEntries');
  if (!entries.length) {
    entriesHost.innerHTML = emptyState('No work entries yet', 'Add your first entry above when you finish a task or reach a useful stopping point.');
  } else {
    entriesHost.innerHTML = entries.map(entryCardHTML).join('');
  }

  const todayTasks = state.tasks
    .filter(task => task.status !== 'completed' && (!task.dueDate || task.dueDate <= today))
    .sort(taskSort);

  const taskHost = document.getElementById('todayTasks');
  if (!todayTasks.length) {
    taskHost.innerHTML = emptyState('Nothing due today', 'Add a task or enjoy the empty list.');
  } else {
    taskHost.innerHTML = todayTasks.map(taskCardHTML).join('');
  }

  const dueOrOpen = state.tasks.filter(task => !task.dueDate || task.dueDate === today);
  const completed = dueOrOpen.filter(task => task.status === 'completed').length;
  const progress = dueOrOpen.length ? Math.round((completed / dueOrOpen.length) * 100) : 0;
  const ring = document.querySelector('.progress-ring');
  ring.style.setProperty('--progress', `${progress}%`);
  document.getElementById('todayProgressValue').textContent = `${progress}%`;

  const review = state.reviews.find(item => item.date === today);
  document.getElementById('reviewProgress').value = review?.mainProgress || '';
  document.getElementById('reviewBlocker').value = review?.blocker || '';
  document.getElementById('reviewTomorrow').value = review?.tomorrowPriority || '';
  document.getElementById('reviewFocus').value = review?.focusRating || '';
  const reviewStatus = document.getElementById('reviewStatus');
  reviewStatus.textContent = review ? 'Day finished' : 'Not finished';
  reviewStatus.className = review ? 'pill' : 'pill subtle';
}

function entryCardHTML(entry) {
  const project = projectById(entry.projectId);
  return `
    <article class="entry-card">
      <div class="entry-top">
        <span class="project-badge"><span class="project-dot" style="--project-color:${project.color}"></span>${escapeHTML(project.name)}</span>
        <span class="status-badge status-${entry.status}">${escapeHTML(entry.status)}</span>
      </div>
      <h4>${escapeHTML(entry.summary)}</h4>
      ${entry.outcome ? `<p class="entry-detail"><strong>Outcome:</strong> ${escapeHTML(entry.outcome)}</p>` : ''}
      ${entry.nextStep ? `<p class="entry-detail"><strong>Next:</strong> ${escapeHTML(entry.nextStep)}</p>` : ''}
      ${entry.timeSpent ? `<p class="entry-detail"><strong>Time:</strong> ${escapeHTML(entry.timeSpent)}</p>` : ''}
      <div class="card-actions">
        <button class="mini-button" type="button" data-edit-entry="${entry.id}">Edit</button>
        <button class="mini-button danger-text" type="button" data-delete-entry="${entry.id}">Delete</button>
      </div>
    </article>`;
}

function taskSort(a, b) {
  if (a.status === 'completed' && b.status !== 'completed') return 1;
  if (a.status !== 'completed' && b.status === 'completed') return -1;
  const priorityRank = { high: 0, normal: 1, low: 2 };
  if (priorityRank[a.priority] !== priorityRank[b.priority]) return priorityRank[a.priority] - priorityRank[b.priority];
  return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
}

function taskCardHTML(task) {
  const project = projectById(task.projectId);
  const completed = task.status === 'completed';
  return `
    <article class="task-card ${completed ? 'completed' : ''}">
      <div class="task-top">
        <div class="task-main">
          <button class="task-check ${completed ? 'checked' : ''}" type="button" data-toggle-task="${task.id}" aria-label="${completed ? 'Reopen' : 'Complete'} task"></button>
          <div>
            <div class="task-title">${escapeHTML(task.title)}</div>
            <div class="task-meta">
              <span class="project-badge"><span class="project-dot" style="--project-color:${project.color}"></span>${escapeHTML(project.name)}</span>
              ${task.dueDate ? `<span>${escapeHTML(formatShortDate(task.dueDate))}</span>` : '<span>No due date</span>'}
              ${task.priority !== 'normal' ? `<span class="priority-${task.priority}">${escapeHTML(task.priority)} priority</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="mini-button" type="button" data-edit-task="${task.id}">Edit</button>
        ${!completed ? `<button class="mini-button" type="button" data-move-task="${task.id}">Move to tomorrow</button>` : ''}
        <button class="mini-button danger-text" type="button" data-delete-task="${task.id}">Delete</button>
      </div>
    </article>`;
}

function renderTasks() {
  const projectFilter = document.getElementById('taskProjectFilter').value || 'all';
  const today = todayISO();
  let tasks = [...state.tasks];

  if (projectFilter !== 'all') tasks = tasks.filter(task => task.projectId === projectFilter);
  if (currentTaskFilter === 'open') tasks = tasks.filter(task => task.status !== 'completed');
  if (currentTaskFilter === 'today') tasks = tasks.filter(task => task.status !== 'completed' && task.dueDate === today);
  if (currentTaskFilter === 'upcoming') tasks = tasks.filter(task => task.status !== 'completed' && task.dueDate && task.dueDate > today);
  if (currentTaskFilter === 'completed') tasks = tasks.filter(task => task.status === 'completed');

  tasks.sort(taskSort);
  const host = document.getElementById('allTasks');
  host.innerHTML = tasks.length ? tasks.map(taskCardHTML).join('') : emptyState('No matching tasks', 'Change the filter or add a new task.');
}

function renderProjects() {
  const host = document.getElementById('projectGrid');
  if (!state.projects.length) {
    host.innerHTML = emptyState('No projects yet', 'Add a project to organize your work entries and tasks.');
    return;
  }
  host.innerHTML = state.projects.map(project => {
    const entries = state.entries.filter(entry => entry.projectId === project.id);
    const openTasks = state.tasks.filter(task => task.projectId === project.id && task.status !== 'completed');
    const lastEntry = entries.sort((a, b) => b.date.localeCompare(a.date))[0];
    return `
      <article class="project-card" style="--project-color:${project.color}">
        <div class="project-top">
          <div>
            <h3>${escapeHTML(project.name)}</h3>
            <p class="muted">${escapeHTML(project.description || 'No description yet.')}</p>
          </div>
        </div>
        <div class="project-stats">
          <div><strong>${entries.length}</strong><span>entries</span></div>
          <div><strong>${openTasks.length}</strong><span>open tasks</span></div>
          <div><strong>${lastEntry ? formatShortDate(lastEntry.date) : '—'}</strong><span>last worked</span></div>
        </div>
        <div class="card-actions">
          <button class="mini-button" type="button" data-edit-project="${project.id}">Edit</button>
          ${project.id !== 'project_general' ? `<button class="mini-button danger-text" type="button" data-delete-project="${project.id}">Delete</button>` : ''}
        </div>
      </article>`;
  }).join('');
}

function renderHistory() {
  const from = document.getElementById('historyFrom').value;
  const to = document.getElementById('historyTo').value;
  const projectId = document.getElementById('historyProjectFilter').value || 'all';

  let entries = [...state.entries];
  if (from) entries = entries.filter(entry => entry.date >= from);
  if (to) entries = entries.filter(entry => entry.date <= to);
  if (projectId !== 'all') entries = entries.filter(entry => entry.projectId === projectId);

  const dateSet = new Set(entries.map(entry => entry.date));
  state.reviews.forEach(review => {
    if ((!from || review.date >= from) && (!to || review.date <= to)) dateSet.add(review.date);
  });

  const dates = [...dateSet].sort((a, b) => b.localeCompare(a));
  const host = document.getElementById('historyList');
  if (!dates.length) {
    host.innerHTML = emptyState('No history yet', 'Your saved daily work entries will appear here.');
    return;
  }

  host.innerHTML = dates.map(date => {
    const dayEntries = entries.filter(entry => entry.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const review = state.reviews.find(item => item.date === date);
    return `
      <article class="history-day">
        <div class="history-header">
          <h3>${escapeHTML(formatDate(date))}</h3>
          <span class="pill subtle">${plural(dayEntries.length, 'entry')}</span>
        </div>
        <div class="history-entries">
          ${dayEntries.length ? dayEntries.map(entryCardHTML).join('') : '<p class="muted">No work entries recorded for this day.</p>'}
        </div>
        ${review ? `
          <div class="review-box">
            <p><strong>Main progress:</strong> ${escapeHTML(review.mainProgress || '—')}</p>
            <p><strong>Blocker:</strong> ${escapeHTML(review.blocker || 'None recorded')}</p>
            <p><strong>Tomorrow:</strong> ${escapeHTML(review.tomorrowPriority || '—')}</p>
            <p><strong>Focus:</strong> ${escapeHTML(review.focusRating || 'Not rated')}${review.focusRating ? '/5' : ''}</p>
          </div>` : ''}
      </article>`;
  }).join('');
}

function renderStorageSummary() {
  document.getElementById('storageSummary').textContent = `${plural(state.projects.length, 'project')}, ${plural(state.tasks.length, 'task')}, ${plural(state.entries.length, 'work entry')}, ${plural(state.reviews.length, 'daily review')}.`;
}

function emptyState(title, text) {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${escapeHTML(text)}</div>`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2200);
}

function openTaskDialog(task = null) {
  const dialog = document.getElementById('taskDialog');
  document.getElementById('taskEditingId').value = task?.id || '';
  document.getElementById('taskTitle').value = task?.title || '';
  document.getElementById('taskProject').value = task?.projectId || state.projects[0].id;
  document.getElementById('taskDueDate').value = task?.dueDate || todayISO();
  document.getElementById('taskPriority').value = task?.priority || 'normal';
  document.getElementById('taskSaveBtn').textContent = task ? 'Update task' : 'Save task';
  dialog.showModal();
  setTimeout(() => document.getElementById('taskTitle').focus(), 50);
}

function openProjectDialog(project = null) {
  document.getElementById('projectEditingId').value = project?.id || '';
  document.getElementById('projectName').value = project?.name || '';
  document.getElementById('projectDescription').value = project?.description || '';
  document.getElementById('projectDialogTitle').textContent = project ? 'Edit project' : 'Add a project';
  selectedProjectColor = project?.color || COLOR_OPTIONS[0];
  renderColorOptions();
  document.getElementById('projectDialog').showModal();
  setTimeout(() => document.getElementById('projectName').focus(), 50);
}

function renderColorOptions() {
  const host = document.getElementById('projectColorOptions');
  host.innerHTML = COLOR_OPTIONS.map(color => `
    <button class="color-option ${selectedProjectColor === color ? 'selected' : ''}" style="background:${color}" data-project-color="${color}" type="button" aria-label="Choose color ${color}"></button>
  `).join('');
}

function tomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0,10);
}

function handleGlobalClick(event) {
  const target = event.target.closest('button');
  if (!target) return;

  if (target.dataset.toggleTask) {
    const task = state.tasks.find(item => item.id === target.dataset.toggleTask);
    if (!task) return;
    task.status = task.status === 'completed' ? 'open' : 'completed';
    task.completedAt = task.status === 'completed' ? new Date().toISOString() : null;
    saveState(task.status === 'completed' ? 'Task completed' : 'Task reopened');
  }

  if (target.dataset.editTask) openTaskDialog(state.tasks.find(task => task.id === target.dataset.editTask));

  if (target.dataset.deleteTask) {
    const task = state.tasks.find(item => item.id === target.dataset.deleteTask);
    if (task && confirm(`Delete “${task.title}”?`)) {
      state.tasks = state.tasks.filter(item => item.id !== task.id);
      saveState('Task deleted');
    }
  }

  if (target.dataset.moveTask) {
    const task = state.tasks.find(item => item.id === target.dataset.moveTask);
    if (task) {
      task.dueDate = tomorrowISO();
      saveState('Task moved to tomorrow');
    }
  }

  if (target.dataset.deleteEntry) {
    if (confirm('Delete this work entry?')) {
      state.entries = state.entries.filter(entry => entry.id !== target.dataset.deleteEntry);
      saveState('Work entry deleted');
    }
  }

  if (target.dataset.editEntry) {
    const entry = state.entries.find(item => item.id === target.dataset.editEntry);
    if (!entry) return;
    document.getElementById('entryProject').value = entry.projectId;
    document.getElementById('entryStatus').value = entry.status;
    document.getElementById('entrySummary').value = entry.summary;
    document.getElementById('entryOutcome').value = entry.outcome || '';
    document.getElementById('entryNextStep').value = entry.nextStep || '';
    document.getElementById('entryTime').value = entry.timeSpent || '';
    document.getElementById('workEntryForm').dataset.editingId = entry.id;
    document.querySelector('#workEntryForm button[type="submit"]').textContent = 'Update work entry';
    document.getElementById('entrySummary').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('entrySummary').focus();
  }

  if (target.dataset.editProject) openProjectDialog(state.projects.find(project => project.id === target.dataset.editProject));

  if (target.dataset.deleteProject) {
    const project = state.projects.find(item => item.id === target.dataset.deleteProject);
    if (!project) return;
    if (confirm(`Delete “${project.name}”? Its tasks and entries will be moved to General.`)) {
      state.tasks.forEach(task => { if (task.projectId === project.id) task.projectId = 'project_general'; });
      state.entries.forEach(entry => { if (entry.projectId === project.id) entry.projectId = 'project_general'; });
      state.projects = state.projects.filter(item => item.id !== project.id);
      saveState('Project deleted');
    }
  }

  if (target.dataset.projectColor) {
    selectedProjectColor = target.dataset.projectColor;
    renderColorOptions();
  }
}

function setupEvents() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
      document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(button.dataset.view).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderAll();
    });
  });

  document.getElementById('workEntryForm').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const editingId = form.dataset.editingId;
    const payload = {
      projectId: document.getElementById('entryProject').value,
      status: document.getElementById('entryStatus').value,
      summary: document.getElementById('entrySummary').value.trim(),
      outcome: document.getElementById('entryOutcome').value.trim(),
      nextStep: document.getElementById('entryNextStep').value.trim(),
      timeSpent: document.getElementById('entryTime').value.trim()
    };
    if (!payload.summary) return;

    if (editingId) {
      const entry = state.entries.find(item => item.id === editingId);
      Object.assign(entry, payload, { updatedAt: new Date().toISOString() });
      delete form.dataset.editingId;
      document.querySelector('#workEntryForm button[type="submit"]').textContent = 'Save work entry';
      saveState('Work entry updated');
    } else {
      state.entries.push({ id: uid('entry'), date: todayISO(), createdAt: new Date().toISOString(), ...payload });
      saveState('Work entry saved');
    }
    form.reset();
    renderProjectSelects();
  });

  document.getElementById('dailyReviewForm').addEventListener('submit', event => {
    event.preventDefault();
    const date = todayISO();
    const review = {
      id: state.reviews.find(item => item.date === date)?.id || uid('review'),
      date,
      mainProgress: document.getElementById('reviewProgress').value.trim(),
      blocker: document.getElementById('reviewBlocker').value.trim(),
      tomorrowPriority: document.getElementById('reviewTomorrow').value.trim(),
      focusRating: document.getElementById('reviewFocus').value,
      finishedAt: new Date().toISOString()
    };
    state.reviews = state.reviews.filter(item => item.date !== date);
    state.reviews.push(review);
    saveState('Day finished');
  });

  document.getElementById('taskForm').addEventListener('submit', event => {
    const submitter = event.submitter;
    if (!submitter || submitter.value === 'cancel') return;
    event.preventDefault();
    const editingId = document.getElementById('taskEditingId').value;
    const payload = {
      title: document.getElementById('taskTitle').value.trim(),
      projectId: document.getElementById('taskProject').value,
      dueDate: document.getElementById('taskDueDate').value,
      priority: document.getElementById('taskPriority').value
    };
    if (!payload.title) return;
    if (editingId) {
      const task = state.tasks.find(item => item.id === editingId);
      Object.assign(task, payload, { updatedAt: new Date().toISOString() });
    } else {
      state.tasks.push({ id: uid('task'), status: 'open', createdAt: new Date().toISOString(), ...payload });
    }
    document.getElementById('taskDialog').close();
    saveState(editingId ? 'Task updated' : 'Task added');
  });

  document.getElementById('projectForm').addEventListener('submit', event => {
    const submitter = event.submitter;
    if (!submitter || submitter.value === 'cancel') return;
    event.preventDefault();
    const editingId = document.getElementById('projectEditingId').value;
    const payload = {
      name: document.getElementById('projectName').value.trim(),
      description: document.getElementById('projectDescription').value.trim(),
      color: selectedProjectColor
    };
    if (!payload.name) return;
    if (editingId) {
      Object.assign(state.projects.find(item => item.id === editingId), payload, { updatedAt: new Date().toISOString() });
    } else {
      state.projects.push({ id: uid('project'), createdAt: new Date().toISOString(), ...payload });
    }
    document.getElementById('projectDialog').close();
    saveState(editingId ? 'Project updated' : 'Project added');
  });

  ['quickTaskBtn', 'addTaskTodayBtn', 'addTaskPageBtn'].forEach(id => document.getElementById(id).addEventListener('click', () => openTaskDialog()));
  document.getElementById('addProjectBtn').addEventListener('click', () => openProjectDialog());

  document.querySelectorAll('[data-task-filter]').forEach(button => {
    button.addEventListener('click', () => {
      currentTaskFilter = button.dataset.taskFilter;
      document.querySelectorAll('[data-task-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderTasks();
    });
  });

  document.getElementById('taskProjectFilter').addEventListener('change', renderTasks);
  ['historyFrom', 'historyTo', 'historyProjectFilter'].forEach(id => document.getElementById(id).addEventListener('change', renderHistory));
  document.getElementById('clearHistoryFilters').addEventListener('click', () => {
    document.getElementById('historyFrom').value = '';
    document.getElementById('historyTo').value = '';
    document.getElementById('historyProjectFilter').value = 'all';
    renderHistory();
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'Daily Work Log', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `daily-work-log-backup-${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Backup exported');
  });

  document.getElementById('importInput').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed.data || parsed;
      if (!Array.isArray(imported.projects) || !Array.isArray(imported.tasks) || !Array.isArray(imported.entries)) throw new Error('Invalid backup');
      if (!confirm('Replace the current app data with this backup?')) return;
      state = { ...defaultState(), ...imported, reviews: Array.isArray(imported.reviews) ? imported.reviews : [] };
      saveState('Backup imported');
    } catch {
      alert('This file is not a valid Daily Work Log backup.');
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('clearDataBtn').addEventListener('click', () => {
    if (confirm('Clear every project, task, entry, and daily review? This cannot be undone.')) {
      state = defaultState();
      saveState('All data cleared');
    }
  });

  document.addEventListener('click', handleGlobalClick);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    document.getElementById('installBtn').classList.remove('hidden');
  });

  document.getElementById('installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('installBtn').classList.add('hidden');
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

setupEvents();
renderColorOptions();
renderAll();
