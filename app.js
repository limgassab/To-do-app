const STORAGE_KEY = 'dailyWorkLog.v1';
const THEME_KEY = 'dailyWorkLog.theme';
const APP_VERSION = 3;
const COLOR_OPTIONS = ['#2a8f88', '#4f7ea8', '#3f8f6b', '#6388a8', '#6e8f7c', '#7d83a5', '#b07b55', '#9a6f91'];

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
const safeColor = color => /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : COLOR_OPTIONS[0];

const defaultState = () => ({
  projects: [{
    id: 'project_general',
    name: 'General',
    description: 'Work not assigned to another project.',
    color: COLOR_OPTIONS[0],
    createdAt: new Date().toISOString()
  }],
  tasks: [],
  entries: [],
  reviews: []
});

let state = loadState();
let currentTaskFilter = 'today';
let selectedProjectColor = COLOR_OPTIONS[0];
let deferredInstallPrompt = null;
let toastTimer = null;
let themePreference = loadThemePreference();

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

  normalized.projects = normalized.projects.map((project, index) => {
    const oldDefault = project.id === 'project_general' && String(project.color).toLowerCase() === '#2563eb';
    return {
      ...project,
      id: project.id || uid('project'),
      name: project.name || `Project ${index + 1}`,
      description: project.description || '',
      color: oldDefault ? COLOR_OPTIONS[0] : safeColor(project.color || COLOR_OPTIONS[index % COLOR_OPTIONS.length]),
      createdAt: project.createdAt || new Date().toISOString()
    };
  });

  normalized.tasks = normalized.tasks.map(task => ({
    ...task,
    id: task.id || uid('task'),
    title: task.title || 'Untitled task',
    status: task.status === 'completed' ? 'completed' : 'open',
    priority: ['high', 'normal', 'low'].includes(task.priority) ? task.priority : 'normal',
    dueDate: task.dueDate || '',
    projectId: normalized.projects.some(project => project.id === task.projectId) ? task.projectId : 'project_general'
  }));

  normalized.entries = normalized.entries.map(entry => ({
    ...entry,
    id: entry.id || uid('entry'),
    date: entry.date || todayISO(),
    summary: entry.summary || '',
    status: ['progressing', 'completed', 'blocked'].includes(entry.status) ? entry.status : 'progressing',
    projectId: normalized.projects.some(project => project.id === entry.projectId) ? entry.projectId : 'project_general'
  }));

  normalized.reviews = normalized.reviews.map(review => ({
    ...review,
    id: review.id || uid('review'),
    date: review.date || todayISO(),
    mainProgress: review.mainProgress || '',
    blocker: review.blocker || '',
    tomorrowPriority: review.tomorrowPriority || '',
    focusRating: review.focusRating || ''
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

function formatDate(dateString, options = { weekday: 'long', month: 'long', day: 'numeric' }) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${dateString}T12:00:00`));
}

function formatShortDate(dateString) {
  return formatDate(dateString, { month: 'short', day: 'numeric' });
}

function plural(count, singular, pluralText = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralText}`;
}

function emptyState(title, message = '') {
  return `<div class="empty-state"><strong>${escapeHTML(title)}</strong>${message ? escapeHTML(message) : ''}</div>`;
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
  renderProjects();
  renderHistory();
  renderStorageSummary();
  renderThemeControls();
}

function renderToday() {
  const today = todayISO();
  byId('todayLongDate').textContent = formatDate(today);
  byId('headerDate').textContent = formatDate(today, { month: 'short', day: 'numeric' });

  const entries = state.entries
    .filter(entry => entry.date === today)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  byId('todayEntryCount').textContent = entries.length;
  byId('todayEntries').innerHTML = entries.length
    ? entries.map(entryCardHTML).join('')
    : emptyState('No updates yet', 'Add one short note about what moved forward.');

  renderTodayTasks();

  const review = state.reviews.find(item => item.date === today);
  byId('reviewProgress').value = review?.mainProgress || '';
  byId('reviewBlocker').value = review?.blocker || '';
  byId('reviewTomorrow').value = review?.tomorrowPriority || '';
  byId('reviewFocus').value = review?.focusRating || '';
  byId('reviewStatus').textContent = review ? 'Day saved' : 'Open day';
  byId('reviewStatus').classList.toggle('saved', Boolean(review));
}

function renderTodayTasks() {
  const today = todayISO();
  const projectFilter = byId('taskProjectFilter').value || 'all';
  let tasks = [...state.tasks];

  if (projectFilter !== 'all') tasks = tasks.filter(task => task.projectId === projectFilter);
  if (currentTaskFilter === 'today') {
    tasks = tasks.filter(task => task.status !== 'completed' && (!task.dueDate || task.dueDate <= today));
  } else if (currentTaskFilter === 'upcoming') {
    tasks = tasks.filter(task => task.status !== 'completed' && task.dueDate && task.dueDate > today);
  } else {
    tasks = tasks.filter(task => task.status === 'completed');
  }

  tasks.sort(taskSort);
  byId('todayTasks').innerHTML = tasks.length
    ? tasks.map(taskCardHTML).join('')
    : emptyState(currentTaskFilter === 'completed' ? 'Nothing completed yet' : 'Nothing here');
}

function entryCardHTML(entry) {
  const project = projectById(entry.projectId);
  const details = [
    entry.outcome ? `<p><strong>Outcome:</strong> ${escapeHTML(entry.outcome)}</p>` : '',
    entry.nextStep ? `<p><strong>Next:</strong> ${escapeHTML(entry.nextStep)}</p>` : '',
    entry.timeSpent ? `<p><strong>Time:</strong> ${escapeHTML(entry.timeSpent)}</p>` : ''
  ].filter(Boolean).join('');

  return `
    <article class="entry-card">
      <div class="entry-top">
        <span class="project-badge"><span class="project-dot" style="--project-color:${safeColor(project.color)}"></span>${escapeHTML(project.name)}</span>
        <span class="status-badge status-${escapeHTML(entry.status)}">${escapeHTML(entry.status)}</span>
      </div>
      <h3>${escapeHTML(entry.summary)}</h3>
      ${details ? `<div class="entry-details">${details}</div>` : ''}
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
      <div class="task-row">
        <div class="task-main">
          <button class="task-check ${completed ? 'checked' : ''}" type="button" data-toggle-task="${escapeHTML(task.id)}" aria-label="${completed ? 'Reopen' : 'Complete'} task"></button>
          <div>
            <div class="task-title">${escapeHTML(task.title)}</div>
            <div class="task-meta">
              <span class="project-badge"><span class="project-dot" style="--project-color:${safeColor(project.color)}"></span>${escapeHTML(project.name)}</span>
              ${task.dueDate ? `<span>${escapeHTML(formatShortDate(task.dueDate))}</span>` : ''}
              ${task.priority !== 'normal' ? `<span class="priority-${escapeHTML(task.priority)}">${escapeHTML(task.priority)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="card-actions">
        <button class="mini-button" type="button" data-edit-task="${escapeHTML(task.id)}">Edit</button>
        ${!completed ? `<button class="mini-button" type="button" data-move-task="${escapeHTML(task.id)}">Tomorrow</button>` : ''}
        <button class="mini-button danger-text" type="button" data-delete-task="${escapeHTML(task.id)}">Delete</button>
      </div>
    </article>`;
}

function renderProjects() {
  const projects = [...state.projects].sort((a, b) => {
    if (a.id === 'project_general') return -1;
    if (b.id === 'project_general') return 1;
    return a.name.localeCompare(b.name);
  });

  byId('projectGrid').innerHTML = projects.map(project => {
    const entries = state.entries.filter(entry => entry.projectId === project.id);
    const openTasks = state.tasks.filter(task => task.projectId === project.id && task.status !== 'completed');
    const lastEntry = [...entries].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    const isGeneral = project.id === 'project_general';
    return `
      <article class="project-card" style="--project-color:${safeColor(project.color)}">
        <div class="project-card-top">
          <div>
            <h2>${escapeHTML(project.name)}</h2>
            ${project.description ? `<p class="muted">${escapeHTML(project.description)}</p>` : ''}
          </div>
        </div>
        <div class="project-stats">
          <span><strong>${entries.length}</strong> updates</span>
          <span><strong>${openTasks.length}</strong> open</span>
          ${lastEntry ? `<span>Last: <strong>${escapeHTML(formatShortDate(lastEntry.date))}</strong></span>` : ''}
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
  if (projectFilter === 'all') {
    state.reviews.forEach(review => {
      const inRange = (!from || review.date >= from) && (!to || review.date <= to);
      if (inRange) dates.add(review.date);
    });
  }

  const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));
  byId('historyList').innerHTML = sortedDates.length
    ? sortedDates.map(date => historyDayHTML(date, entries.filter(entry => entry.date === date))).join('')
    : emptyState('No matching history');
}

function historyDayHTML(date, entries) {
  const review = state.reviews.find(item => item.date === date);
  return `
    <section class="history-day">
      <div class="history-day-header">
        <h2>${escapeHTML(formatDate(date))}</h2>
        <span class="count-label">${entries.length}</span>
      </div>
      ${entries.length ? `<div class="history-entries">${entries.map(entryCardHTML).join('')}</div>` : ''}
      ${review ? `
        <div class="review-box">
          ${review.mainProgress ? `<p><strong>Progress:</strong> ${escapeHTML(review.mainProgress)}</p>` : ''}
          ${review.tomorrowPriority ? `<p><strong>Next priority:</strong> ${escapeHTML(review.tomorrowPriority)}</p>` : ''}
          ${review.blocker ? `<p><strong>Blocker:</strong> ${escapeHTML(review.blocker)}</p>` : ''}
          ${review.focusRating ? `<p><strong>Focus:</strong> ${escapeHTML(review.focusRating)}/5</p>` : ''}
        </div>` : ''}
    </section>`;
}

function renderStorageSummary() {
  byId('storageSummary').textContent = `${plural(state.projects.length, 'project')} · ${plural(state.entries.length, 'update')} · ${plural(state.tasks.length, 'task')}`;
}

function renderColorOptions() {
  byId('projectColorOptions').innerHTML = COLOR_OPTIONS.map(color => `
    <button class="color-option ${color === selectedProjectColor ? 'selected' : ''}" style="--option-color:${color}" data-project-color="${color}" type="button" aria-label="Choose project color"></button>
  `).join('');
}

function resetEntryForm() {
  byId('workEntryForm').reset();
  byId('entryEditingId').value = '';
  byId('entryOptionalDetails').open = false;
  byId('entryStatus').value = 'progressing';
  byId('saveEntryBtn').textContent = 'Add update';
  byId('cancelEntryEditBtn').classList.add('hidden');
  if (state.projects[0]) byId('entryProject').value = state.projects[0].id;
}

function openTaskDialog(task = null, defaultToday = false) {
  byId('taskForm').reset();
  byId('taskEditingId').value = task?.id || '';
  byId('taskDialogTitle').textContent = task ? 'Edit task' : 'Add task';
  byId('saveTaskBtn').textContent = task ? 'Update' : 'Save';
  byId('taskTitle').value = task?.title || '';
  byId('taskProject').value = task?.projectId || state.projects[0]?.id || '';
  byId('taskDueDate').value = task?.dueDate || (defaultToday ? todayISO() : '');
  byId('taskPriority').value = task?.priority || 'normal';
  byId('taskDialog').showModal();
  setTimeout(() => byId('taskTitle').focus(), 30);
}

function openProjectDialog(project = null) {
  byId('projectForm').reset();
  byId('projectEditingId').value = project?.id || '';
  byId('projectDialogTitle').textContent = project ? 'Edit project' : 'Add project';
  byId('saveProjectBtn').textContent = project ? 'Update' : 'Save';
  byId('projectName').value = project?.name || '';
  byId('projectDescription').value = project?.description || '';
  selectedProjectColor = safeColor(project?.color || COLOR_OPTIONS[state.projects.length % COLOR_OPTIONS.length]);
  renderColorOptions();
  byId('projectDialog').showModal();
  setTimeout(() => byId('projectName').focus(), 30);
}

function closeDialog(dialogId) {
  const dialog = byId(dialogId);
  if (dialog?.open) dialog.close();
}

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewId));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message) {
  const toast = byId('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
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
    if (task) {
      task.status = task.status === 'completed' ? 'open' : 'completed';
      task.completedAt = task.status === 'completed' ? new Date().toISOString() : '';
      saveState(task.status === 'completed' ? 'Task completed' : 'Task reopened');
    }
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
      saveState('Moved to tomorrow');
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
    byId('entryOptionalDetails').open = Boolean(entry.outcome || entry.nextStep || entry.timeSpent || entry.status !== 'progressing');
    byId('saveEntryBtn').textContent = 'Update';
    byId('cancelEntryEditBtn').classList.remove('hidden');
    byId('workEntryForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => byId('entrySummary').focus(), 180);
    return;
  }

  if (target.dataset.deleteEntry) {
    if (confirm('Delete this work update?')) {
      state.entries = state.entries.filter(entry => entry.id !== target.dataset.deleteEntry);
      saveState('Update deleted');
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
    if (confirm(`Delete “${project.name}”? Its tasks and work updates will move to General.`)) {
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
    return;
  }

  if (target.dataset.themeChoice) {
    setThemePreference(target.dataset.themeChoice);
  }
}

function setupEvents() {
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });

  byId('workEntryForm').addEventListener('submit', event => {
    event.preventDefault();
    const summary = byId('entrySummary').value.trim();
    if (!summary) return byId('entrySummary').focus();

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
    } else {
      state.entries.push({ id: uid('entry'), date: todayISO(), createdAt: new Date().toISOString(), ...payload });
    }

    saveState(editingId ? 'Update saved' : 'Added to today');
    resetEntryForm();
  });

  byId('cancelEntryEditBtn').addEventListener('click', resetEntryForm);

  byId('dailyReviewForm').addEventListener('submit', event => {
    event.preventDefault();
    const date = todayISO();
    const todaysEntries = state.entries.filter(entry => entry.date === date);
    const automaticProgress = todaysEntries.map(entry => entry.summary).filter(Boolean).join(' · ');
    const review = {
      id: state.reviews.find(item => item.date === date)?.id || uid('review'),
      date,
      mainProgress: byId('reviewProgress').value.trim() || automaticProgress,
      blocker: byId('reviewBlocker').value.trim(),
      tomorrowPriority: byId('reviewTomorrow').value.trim(),
      focusRating: byId('reviewFocus').value,
      finishedAt: new Date().toISOString()
    };
    state.reviews = state.reviews.filter(item => item.date !== date);
    state.reviews.push(review);
    saveState('Day saved');
    byId('closeDayPanel').open = false;
  });

  byId('taskForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = byId('taskTitle').value.trim();
    if (!title) return byId('taskTitle').focus();

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
    if (!name) return byId('projectName').focus();

    const editingId = byId('projectEditingId').value;
    const payload = {
      name,
      description: byId('projectDescription').value.trim(),
      color: safeColor(selectedProjectColor)
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
  byId('addProjectBtn').addEventListener('click', () => openProjectDialog());
  byId('settingsBtn').addEventListener('click', () => byId('settingsDialog').showModal());

  document.querySelectorAll('[data-task-filter]').forEach(button => {
    button.addEventListener('click', () => {
      currentTaskFilter = button.dataset.taskFilter;
      document.querySelectorAll('[data-task-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderTodayTasks();
    });
  });

  byId('taskProjectFilter').addEventListener('change', renderTodayTasks);
  ['historyFrom', 'historyTo', 'historyProjectFilter'].forEach(id => byId(id).addEventListener('change', renderHistory));
  byId('clearHistoryFilters').addEventListener('click', () => {
    byId('historyFrom').value = '';
    byId('historyTo').value = '';
    byId('historyProjectFilter').value = 'all';
    renderHistory();
  });

  byId('exportBtn').addEventListener('click', exportBackup);
  byId('importInput').addEventListener('change', importBackup);
  byId('clearDataBtn').addEventListener('click', () => {
    if (confirm('Clear every project, task, work update, and daily review? This cannot be undone.')) {
      state = defaultState();
      saveState('All data cleared');
      closeDialog('settingsDialog');
    }
  });

  byId('themeToggle').addEventListener('click', () => {
    const next = resolvedTheme() === 'dark' ? 'light' : 'dark';
    setThemePreference(next);
  });

  document.addEventListener('click', handleGlobalClick);

  ['taskDialog', 'projectDialog', 'settingsDialog'].forEach(id => {
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

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (themePreference === 'system') applyTheme();
  });
}

function exportBackup() {
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
}

async function importBackup(event) {
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
    closeDialog('settingsDialog');
  } catch (error) {
    alert('This file is not a valid Daily Work Log backup.');
  } finally {
    event.target.value = '';
  }
}

function loadThemePreference() {
  const saved = localStorage.getItem(THEME_KEY);
  return ['system', 'light', 'dark'].includes(saved) ? saved : 'system';
}

function resolvedTheme() {
  if (themePreference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return themePreference;
}

function applyTheme() {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  byId('themeIcon').textContent = theme === 'dark' ? '☀' : '☾';
  byId('themeToggle').title = theme === 'dark' ? 'Use light mode' : 'Use dark mode';
  const themeColor = theme === 'dark' ? '#0f1d21' : '#2a8f88';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
  renderThemeControls();
}

function setThemePreference(preference) {
  if (!['system', 'light', 'dark'].includes(preference)) return;
  themePreference = preference;
  localStorage.setItem(THEME_KEY, preference);
  applyTheme();
}

function renderThemeControls() {
  document.querySelectorAll('[data-theme-choice]').forEach(button => {
    button.classList.toggle('active', button.dataset.themeChoice === themePreference);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js');
      registration.update();

      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}

applyTheme();
setupEvents();
renderColorOptions();
renderAll();
registerServiceWorker();
