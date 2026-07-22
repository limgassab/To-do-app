const STORAGE_KEY = 'dailyWorkLog.v1';
const APP_VERSION = 2;
const COLOR_OPTIONS = ['#2563eb', '#0284c7', '#0891b2', '#0f766e', '#4f46e5', '#64748b', '#16a34a', '#d97706'];

const byId = id => document.getElementById(id);
const localDateISO = (date = new Date()) => {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return copy.toISOString().slice(0, 10);
};
const todayISO = () => localDateISO();
const tomorrowISO = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return localDateISO(date);
};
const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

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
let toastTimer = null;

function normalizeState(saved) {
  const base = defaultState();
  const normalized = {
    projects: Array.isArray(saved?.projects) ? saved.projects : base.projects,
    tasks: Array.isArray(saved?.tasks) ? saved.tasks : [],
    entries: Array.isArray(saved?.entries) ? saved.entries : [],
    reviews: Array.isArray(saved?.reviews) ? saved.reviews : []
  };

  if (!normalized.projects.some(project => project.id === 'project_general')) {
    normalized.projects.unshift(base.projects[0]);
  }

  normalized.projects = normalized.projects.map((project, index) => ({
    ...project,
    id: project.id || uid('project'),
    name: project.name || `Project ${index + 1}`,
    description: project.description || '',
    color: project.color || COLOR_OPTIONS[index % COLOR_OPTIONS.length],
    createdAt: project.createdAt || new Date().toISOString()
  }));

  normalized.tasks = normalized.tasks.map(task => ({
    ...task,
    status: task.status === 'completed' ? 'completed' : 'open',
    priority: ['high', 'normal', 'low'].includes(task.priority) ? task.priority : 'normal',
    dueDate: task.dueDate || '',
    projectId: normalized.projects.some(project => project.id === task.projectId) ? task.projectId : 'project_general'
  }));

  normalized.entries = normalized.entries.map(entry => ({
    ...entry,
    date: entry.date || todayISO(),
    status: ['progressing', 'completed', 'blocked'].includes(entry.status) ? entry.status : 'progressing',
    projectId: normalized.projects.some(project => project.id === entry.projectId) ? entry.projectId : 'project_general'
  }));

  return normalized;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : defaultState();
  } catch (error) {
    console.warn('Could not read saved data:', error);
    return defaultState();
  }
}

function saveState(message = '') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  if (message) showToast(message);
}

function projectById(projectId) {
  return state.projects.find(project => project.id === projectId) || state.projects[0];
}

function formatDate(dateString, options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dateString}T12:00:00`));
}

function formatShortDate(dateString) {
  return formatDate(dateString, { month: 'short', day: 'numeric' });
}

function plural(count, singular, pluralText = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralText}`;
}

function emptyState(title, message) {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${escapeHTML(message)}</div>`;
}

function setProjectOptions(select, { includeAll = false, selectedValue = '' } = {}) {
  const options = [];
  if (includeAll) options.push('<option value="all">All projects</option>');
  state.projects.forEach(project => {
    options.push(`<option value="${escapeHTML(project.id)}">${escapeHTML(project.name)}</option>`);
  });
  select.innerHTML = options.join('');
  if (selectedValue && [...select.options].some(option => option.value === selectedValue)) {
    select.value = selectedValue;
  }
}

function renderProjectSelects() {
  [
    ['entryProject', false],
    ['taskProject', false],
    ['taskProjectFilter', true],
    ['historyProjectFilter', true]
  ].forEach(([id, includeAll]) => {
    const select = byId(id);
    const currentValue = select.value;
    setProjectOptions(select, { includeAll, selectedValue: currentValue });
  });
}

function renderAll() {
  renderProjectSelects();
  renderToday();
  renderTasks();
  renderProjects();
  renderHistory();
  renderStorageSummary();
}

function renderToday() {
  const today = todayISO();
  byId('todayLongDate').textContent = formatDate(today);

  const entries = state.entries
    .filter(entry => entry.date === today)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  byId('todayEntryCount').textContent = plural(entries.length, 'entry');
  byId('statEntries').textContent = entries.length;
  byId('statProjects').textContent = new Set(entries.map(entry => entry.projectId)).size;
  byId('statTasks').textContent = state.tasks.filter(task => task.status !== 'completed').length;
  byId('todayEntries').innerHTML = entries.length
    ? entries.map(entryCardHTML).join('')
    : emptyState('No work entries yet', 'Add a short note when you reach a useful stopping point.');

  const visibleTodayTasks = state.tasks
    .filter(task => task.status !== 'completed' && (!task.dueDate || task.dueDate <= today))
    .sort(taskSort);

  byId('todayTasks').innerHTML = visibleTodayTasks.length
    ? visibleTodayTasks.map(taskCardHTML).join('')
    : emptyState('Nothing due today', 'Add a task or enjoy the empty list.');

  const tasksForProgress = state.tasks.filter(task => task.dueDate === today);
  const completedToday = tasksForProgress.filter(task => task.status === 'completed').length;
  const progress = tasksForProgress.length ? Math.round((completedToday / tasksForProgress.length) * 100) : 0;
  byId('todayProgressValue').textContent = `${progress}%`;

  const review = state.reviews.find(item => item.date === today);
  byId('reviewProgress').value = review?.mainProgress || '';
  byId('reviewBlocker').value = review?.blocker || '';
  byId('reviewTomorrow').value = review?.tomorrowPriority || '';
  byId('reviewFocus').value = review?.focusRating || '';

  const status = byId('reviewStatus');
  status.textContent = review ? 'Day finished' : 'Not finished';
  status.className = review ? 'pill' : 'pill subtle';
}

function entryCardHTML(entry) {
  const project = projectById(entry.projectId);
  return `
    <article class="entry-card">
      <div class="entry-top">
        <span class="project-badge"><span class="project-dot" style="--project-color:${escapeHTML(project.color)}"></span>${escapeHTML(project.name)}</span>
        <span class="status-badge status-${escapeHTML(entry.status)}">${escapeHTML(entry.status)}</span>
      </div>
      <h3>${escapeHTML(entry.summary)}</h3>
      ${entry.outcome ? `<p class="entry-detail"><strong>Outcome:</strong> ${escapeHTML(entry.outcome)}</p>` : ''}
      ${entry.nextStep ? `<p class="entry-detail"><strong>Next:</strong> ${escapeHTML(entry.nextStep)}</p>` : ''}
      ${entry.timeSpent ? `<p class="entry-detail"><strong>Time:</strong> ${escapeHTML(entry.timeSpent)}</p>` : ''}
      <div class="card-actions">
        <button class="mini-button" type="button" data-edit-entry="${escapeHTML(entry.id)}">Edit</button>
        <button class="mini-button danger-text" type="button" data-delete-entry="${escapeHTML(entry.id)}">Delete</button>
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
          <button class="task-check ${completed ? 'checked' : ''}" type="button" data-toggle-task="${escapeHTML(task.id)}" aria-label="${completed ? 'Reopen' : 'Complete'} task"></button>
          <div>
            <div class="task-title">${escapeHTML(task.title)}</div>
            <div class="task-meta">
              <span class="project-badge"><span class="project-dot" style="--project-color:${escapeHTML(project.color)}"></span>${escapeHTML(project.name)}</span>
              ${task.dueDate ? `<span>${escapeHTML(formatShortDate(task.dueDate))}</span>` : '<span>No due date</span>'}
              ${task.priority !== 'normal' ? `<span class="priority-${escapeHTML(task.priority)}">${escapeHTML(task.priority)} priority</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="mini-button" type="button" data-edit-task="${escapeHTML(task.id)}">Edit</button>
        ${!completed ? `<button class="mini-button" type="button" data-move-task="${escapeHTML(task.id)}">Move to tomorrow</button>` : ''}
        <button class="mini-button danger-text" type="button" data-delete-task="${escapeHTML(task.id)}">Delete</button>
      </div>
    </article>`;
}

function renderTasks() {
  const projectFilter = byId('taskProjectFilter').value || 'all';
  const today = todayISO();
  let tasks = [...state.tasks];

  if (projectFilter !== 'all') tasks = tasks.filter(task => task.projectId === projectFilter);
  if (currentTaskFilter === 'open') tasks = tasks.filter(task => task.status !== 'completed');
  if (currentTaskFilter === 'today') tasks = tasks.filter(task => task.status !== 'completed' && (!task.dueDate || task.dueDate <= today));
  if (currentTaskFilter === 'upcoming') tasks = tasks.filter(task => task.status !== 'completed' && task.dueDate && task.dueDate > today);
  if (currentTaskFilter === 'completed') tasks = tasks.filter(task => task.status === 'completed');

  tasks.sort(taskSort);
  byId('allTasks').innerHTML = tasks.length
    ? tasks.map(taskCardHTML).join('')
    : emptyState('No matching tasks', 'Change the filter or add a new task.');
}

function renderProjects() {
  byId('projectGrid').innerHTML = state.projects.map(project => {
    const entries = state.entries.filter(entry => entry.projectId === project.id);
    const openTasks = state.tasks.filter(task => task.projectId === project.id && task.status !== 'completed');
    const lastEntry = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const isGeneral = project.id === 'project_general';
    return `
      <article class="project-card" style="--project-color:${escapeHTML(project.color)}">
        <div class="project-top">
          <div>
            <h2>${escapeHTML(project.name)}</h2>
            <p class="muted">${escapeHTML(project.description || 'No description yet.')}</p>
          </div>
        </div>
        <div class="project-stats">
          <div><strong>${entries.length}</strong><span>entries</span></div>
          <div><strong>${openTasks.length}</strong><span>open tasks</span></div>
          <div><strong>${lastEntry ? escapeHTML(formatShortDate(lastEntry.date)) : '—'}</strong><span>last worked</span></div>
        </div>
        <div class="card-actions">
          <button class="mini-button" type="button" data-edit-project="${escapeHTML(project.id)}">Edit</button>
          ${isGeneral ? '' : `<button class="mini-button danger-text" type="button" data-delete-project="${escapeHTML(project.id)}">Delete</button>`}
        </div>
      </article>`;
  }).join('');
}

function renderHistory() {
  const from = byId('historyFrom').value;
  const to = byId('historyTo').value;
  const projectFilter = byId('historyProjectFilter').value || 'all';

  let entries = [...state.entries];
  if (from) entries = entries.filter(entry => entry.date >= from);
  if (to) entries = entries.filter(entry => entry.date <= to);
  if (projectFilter !== 'all') entries = entries.filter(entry => entry.projectId === projectFilter);

  const dates = new Set(entries.map(entry => entry.date));
  state.reviews.forEach(review => {
    const inRange = (!from || review.date >= from) && (!to || review.date <= to);
    if (inRange && projectFilter === 'all') dates.add(review.date);
  });

  const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));
  byId('historyList').innerHTML = sortedDates.length
    ? sortedDates.map(date => historyDayHTML(date, entries.filter(entry => entry.date === date))).join('')
    : emptyState('No history found', 'Try another date range or project.');
}

function historyDayHTML(date, entries) {
  const review = state.reviews.find(item => item.date === date);
  return `
    <section class="history-day">
      <div class="history-header">
        <h2>${escapeHTML(formatDate(date))}</h2>
        <span class="pill">${plural(entries.length, 'entry')}</span>
      </div>
      ${entries.length ? `<div class="history-entries">${entries.map(entryCardHTML).join('')}</div>` : ''}
      ${review ? `
        <div class="review-box">
          <p class="section-label">DAILY REVIEW</p>
          ${review.mainProgress ? `<p><strong>Main progress:</strong> ${escapeHTML(review.mainProgress)}</p>` : ''}
          ${review.blocker ? `<p><strong>Blocker:</strong> ${escapeHTML(review.blocker)}</p>` : ''}
          ${review.tomorrowPriority ? `<p><strong>Next priority:</strong> ${escapeHTML(review.tomorrowPriority)}</p>` : ''}
          ${review.focusRating ? `<p><strong>Focus:</strong> ${escapeHTML(review.focusRating)}/5</p>` : ''}
        </div>` : ''}
    </section>`;
}

function renderStorageSummary() {
  byId('storageSummary').textContent = `${plural(state.projects.length, 'project')} · ${plural(state.tasks.length, 'task')} · ${plural(state.entries.length, 'work entry', 'work entries')}`;
}

function renderColorOptions() {
  byId('projectColorOptions').innerHTML = COLOR_OPTIONS.map(color => `
    <button class="color-option ${color === selectedProjectColor ? 'selected' : ''}" type="button" data-project-color="${color}" style="--swatch:${color}" aria-label="Choose ${color}"></button>
  `).join('');
}

function resetEntryForm() {
  const form = byId('workEntryForm');
  form.reset();
  byId('entryEditingId').value = '';
  byId('saveEntryBtn').textContent = 'Save work entry';
  byId('cancelEntryEditBtn').classList.add('hidden');
  byId('entryOptionalDetails').open = false;
  renderProjectSelects();
}

function openTaskDialog(task = null, dueToday = false) {
  const dialog = byId('taskDialog');
  byId('taskForm').reset();
  byId('taskEditingId').value = task?.id || '';
  byId('taskDialogTitle').textContent = task ? 'Edit task' : 'Add task';
  byId('saveTaskBtn').textContent = task ? 'Update task' : 'Save task';
  renderProjectSelects();
  byId('taskTitle').value = task?.title || '';
  byId('taskProject').value = task?.projectId || state.projects[0].id;
  byId('taskDueDate').value = task?.dueDate || (dueToday ? todayISO() : '');
  byId('taskPriority').value = task?.priority || 'normal';
  dialog.showModal();
  requestAnimationFrame(() => byId('taskTitle').focus());
}

function openProjectDialog(project = null) {
  const dialog = byId('projectDialog');
  byId('projectForm').reset();
  byId('projectEditingId').value = project?.id || '';
  byId('projectDialogTitle').textContent = project ? 'Edit project' : 'Add project';
  byId('saveProjectBtn').textContent = project ? 'Update project' : 'Save project';
  byId('projectName').value = project?.name || '';
  byId('projectDescription').value = project?.description || '';
  selectedProjectColor = project?.color || COLOR_OPTIONS[0];
  renderColorOptions();
  dialog.showModal();
  requestAnimationFrame(() => byId('projectName').focus());
}

function closeDialog(dialogId) {
  const dialog = byId(dialogId);
  if (dialog?.open) dialog.close();
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderAll();
}

function handleGlobalClick(event) {
  const target = event.target.closest('button');
  if (!target) return;

  if (target.dataset.closeDialog) {
    closeDialog(target.dataset.closeDialog);
    return;
  }

  if (target.dataset.goView) {
    switchView(target.dataset.goView);
    return;
  }

  if (target.dataset.toggleTask) {
    const task = state.tasks.find(item => item.id === target.dataset.toggleTask);
    if (!task) return;
    task.status = task.status === 'completed' ? 'open' : 'completed';
    task.completedAt = task.status === 'completed' ? new Date().toISOString() : '';
    saveState(task.status === 'completed' ? 'Task completed' : 'Task reopened');
    return;
  }

  if (target.dataset.editTask) {
    openTaskDialog(state.tasks.find(task => task.id === target.dataset.editTask));
    return;
  }

  if (target.dataset.deleteTask) {
    if (confirm('Delete this task?')) {
      state.tasks = state.tasks.filter(task => task.id !== target.dataset.deleteTask);
      saveState('Task deleted');
    }
    return;
  }

  if (target.dataset.moveTask) {
    const task = state.tasks.find(item => item.id === target.dataset.moveTask);
    if (task) {
      task.dueDate = tomorrowISO();
      saveState('Task moved to tomorrow');
    }
    return;
  }

  if (target.dataset.editEntry) {
    const entry = state.entries.find(item => item.id === target.dataset.editEntry);
    if (!entry) return;
    switchView('todayView');
    byId('entryEditingId').value = entry.id;
    byId('entryProject').value = entry.projectId;
    byId('entryStatus').value = entry.status;
    byId('entrySummary').value = entry.summary || '';
    byId('entryOutcome').value = entry.outcome || '';
    byId('entryNextStep').value = entry.nextStep || '';
    byId('entryTime').value = entry.timeSpent || '';
    byId('entryOptionalDetails').open = Boolean(entry.outcome || entry.nextStep || entry.timeSpent);
    byId('saveEntryBtn').textContent = 'Update work entry';
    byId('cancelEntryEditBtn').classList.remove('hidden');
    byId('workEntryForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => byId('entrySummary').focus(), 250);
    return;
  }

  if (target.dataset.deleteEntry) {
    if (confirm('Delete this work entry?')) {
      state.entries = state.entries.filter(entry => entry.id !== target.dataset.deleteEntry);
      saveState('Work entry deleted');
    }
    return;
  }

  if (target.dataset.editProject) {
    openProjectDialog(state.projects.find(project => project.id === target.dataset.editProject));
    return;
  }

  if (target.dataset.deleteProject) {
    const project = state.projects.find(item => item.id === target.dataset.deleteProject);
    if (!project) return;
    if (confirm(`Delete “${project.name}”? Its tasks and entries will be moved to General.`)) {
      state.tasks.forEach(task => { if (task.projectId === project.id) task.projectId = 'project_general'; });
      state.entries.forEach(entry => { if (entry.projectId === project.id) entry.projectId = 'project_general'; });
      state.projects = state.projects.filter(item => item.id !== project.id);
      saveState('Project deleted');
    }
    return;
  }

  if (target.dataset.projectColor) {
    selectedProjectColor = target.dataset.projectColor;
    renderColorOptions();
  }
}

function setupEvents() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  byId('workEntryForm').addEventListener('submit', event => {
    event.preventDefault();
    const summary = byId('entrySummary').value.trim();
    if (!summary) {
      byId('entrySummary').focus();
      return;
    }

    const payload = {
      projectId: byId('entryProject').value,
      status: byId('entryStatus').value,
      summary,
      outcome: byId('entryOutcome').value.trim(),
      nextStep: byId('entryNextStep').value.trim(),
      timeSpent: byId('entryTime').value.trim()
    };

    const editingId = byId('entryEditingId').value;
    if (editingId) {
      const entry = state.entries.find(item => item.id === editingId);
      if (entry) Object.assign(entry, payload, { updatedAt: new Date().toISOString() });
      saveState('Work entry updated');
    } else {
      state.entries.push({ id: uid('entry'), date: todayISO(), createdAt: new Date().toISOString(), ...payload });
      saveState('Work entry saved');
    }
    resetEntryForm();
  });

  byId('cancelEntryEditBtn').addEventListener('click', resetEntryForm);

  byId('dailyReviewForm').addEventListener('submit', event => {
    event.preventDefault();
    const date = todayISO();
    const review = {
      id: state.reviews.find(item => item.date === date)?.id || uid('review'),
      date,
      mainProgress: byId('reviewProgress').value.trim(),
      blocker: byId('reviewBlocker').value.trim(),
      tomorrowPriority: byId('reviewTomorrow').value.trim(),
      focusRating: byId('reviewFocus').value,
      finishedAt: new Date().toISOString()
    };
    state.reviews = state.reviews.filter(item => item.date !== date);
    state.reviews.push(review);
    saveState('Day finished');
  });

  byId('taskForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = byId('taskTitle').value.trim();
    if (!title) {
      byId('taskTitle').focus();
      return;
    }

    const editingId = byId('taskEditingId').value;
    const payload = {
      title,
      projectId: byId('taskProject').value,
      dueDate: byId('taskDueDate').value,
      priority: byId('taskPriority').value
    };

    if (editingId) {
      const task = state.tasks.find(item => item.id === editingId);
      if (task) Object.assign(task, payload, { updatedAt: new Date().toISOString() });
    } else {
      state.tasks.push({ id: uid('task'), status: 'open', createdAt: new Date().toISOString(), ...payload });
    }

    closeDialog('taskDialog');
    saveState(editingId ? 'Task updated' : 'Task added');
  });

  byId('projectForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = byId('projectName').value.trim();
    if (!name) {
      byId('projectName').focus();
      return;
    }

    const editingId = byId('projectEditingId').value;
    const payload = {
      name,
      description: byId('projectDescription').value.trim(),
      color: selectedProjectColor
    };

    if (editingId) {
      const project = state.projects.find(item => item.id === editingId);
      if (project) Object.assign(project, payload, { updatedAt: new Date().toISOString() });
    } else {
      state.projects.push({ id: uid('project'), createdAt: new Date().toISOString(), ...payload });
    }

    closeDialog('projectDialog');
    saveState(editingId ? 'Project updated' : 'Project added');
  });

  byId('quickTaskBtn').addEventListener('click', () => openTaskDialog());
  byId('addTaskTodayBtn').addEventListener('click', () => openTaskDialog(null, true));
  byId('addTaskPageBtn').addEventListener('click', () => openTaskDialog());
  byId('addProjectBtn').addEventListener('click', () => openProjectDialog());

  document.querySelectorAll('[data-task-filter]').forEach(button => {
    button.addEventListener('click', () => {
      currentTaskFilter = button.dataset.taskFilter;
      document.querySelectorAll('[data-task-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderTasks();
    });
  });

  byId('taskProjectFilter').addEventListener('change', renderTasks);
  ['historyFrom', 'historyTo', 'historyProjectFilter'].forEach(id => byId(id).addEventListener('change', renderHistory));
  byId('clearHistoryFilters').addEventListener('click', () => {
    byId('historyFrom').value = '';
    byId('historyTo').value = '';
    byId('historyProjectFilter').value = 'all';
    renderHistory();
  });

  byId('exportBtn').addEventListener('click', () => {
    const backup = {
      app: 'Daily Work Log',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `daily-work-log-backup-${todayISO()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('Backup exported');
  });

  byId('importInput').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed.data || parsed;
      if (!Array.isArray(imported.projects) || !Array.isArray(imported.tasks) || !Array.isArray(imported.entries)) {
        throw new Error('Invalid backup');
      }
      if (!confirm('Replace the current app data with this backup?')) return;
      state = normalizeState(imported);
      saveState('Backup imported');
    } catch (error) {
      alert('This file is not a valid Daily Work Log backup.');
    } finally {
      event.target.value = '';
    }
  });

  byId('clearDataBtn').addEventListener('click', () => {
    if (confirm('Clear every project, task, entry, and daily review? This cannot be undone.')) {
      state = defaultState();
      saveState('All data cleared');
    }
  });

  document.addEventListener('click', handleGlobalClick);

  ['taskDialog', 'projectDialog'].forEach(id => {
    const dialog = byId(id);
    dialog.addEventListener('click', event => {
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
      if (outside) dialog.close();
    });
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    byId('installBtn').classList.remove('hidden');
  });

  byId('installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    byId('installBtn').classList.add('hidden');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      registration.update();
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}

setupEvents();
renderColorOptions();
renderAll();
registerServiceWorker();
