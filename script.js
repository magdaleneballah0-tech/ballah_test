(function () {
  'use strict';

  /* ------------------------------------------------------------
     STATE
     ------------------------------------------------------------ */
  const STORAGE_KEY = 'campusLedger.tasks.v1';
  let tasks = [];
  let currentFilter = 'all';   // all | pending | completed
  let searchTerm = '';
  let pendingDeleteId = null;

  /* ------------------------------------------------------------
     ELEMENTS
     ------------------------------------------------------------ */
  const form          = document.getElementById('taskForm');
  const formTitle     = document.getElementById('formTitle');
  const taskIdField    = document.getElementById('taskId');
  const titleField     = document.getElementById('taskTitle');
  const courseField    = document.getElementById('taskCourse');
  const dueField       = document.getElementById('taskDue');
  const priorityField  = document.getElementById('taskPriority');
  const formError      = document.getElementById('formError');
  const submitBtn      = document.getElementById('submitBtn');
  const cancelEditBtn  = document.getElementById('cancelEditBtn');

  const searchInput   = document.getElementById('searchInput');
  const filterTabs    = document.querySelectorAll('.filter-tab');

  const taskListEl    = document.getElementById('taskList');
  const emptyStateEl  = document.getElementById('emptyState');

  const statTotal     = document.getElementById('statTotal');
  const statPending   = document.getElementById('statPending');
  const statCompleted = document.getElementById('statCompleted');
  const statHigh      = document.getElementById('statHigh');

  const confirmSlip    = document.getElementById('confirmSlip');
  const confirmMessage = document.getElementById('confirmMessage');
  const confirmCancel  = document.getElementById('confirmCancel');
  const confirmDelete  = document.getElementById('confirmDelete');

  const todayStamp = document.getElementById('todayStamp');

  /* ------------------------------------------------------------
     PERSISTENCE
     ------------------------------------------------------------ */
  function loadTasks() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      tasks = raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error('Could not read saved tasks:', err);
      tasks = [];
    }
  }

  function saveTasks() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (err) {
      console.error('Could not save tasks:', err);
      alert('Your task could not be saved to this device. Storage may be full or disabled.');
    }
  }

  /* ------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------ */
  function uid() {
    return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDue(dateStr) {
    // dateStr is YYYY-MM-DD from <input type="date">
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function isOverdue(dateStr, status) {
    if (status === 'completed') return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  }

  function priorityRank(p) {
    return { High: 0, Medium: 1, Low: 2 }[p] ?? 3;
  }

  /* ------------------------------------------------------------
     RENDER: dashboard
     ------------------------------------------------------------ */
  function renderStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = total - completed;
    const high = tasks.filter(t => t.priority === 'High' && t.status !== 'completed').length;

    statTotal.textContent = total;
    statPending.textContent = pending;
    statCompleted.textContent = completed;
    statHigh.textContent = high;
  }

  /* ------------------------------------------------------------
     RENDER: task list
     ------------------------------------------------------------ */
  function getVisibleTasks() {
    let list = tasks.slice();

    if (currentFilter === 'pending') {
      list = list.filter(t => t.status !== 'completed');
    } else if (currentFilter === 'completed') {
      list = list.filter(t => t.status === 'completed');
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.course.toLowerCase().includes(q)
      );
    }

    // Sort: pending before completed, then by due date, then by priority
    list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'completed' ? 1 : -1;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return priorityRank(a.priority) - priorityRank(b.priority);
    });

    return list;
  }

  function renderTaskCard(task) {
    const overdue = isOverdue(task.due, task.status);
    const completed = task.status === 'completed';

    const card = document.createElement('article');
    card.className = 'task-card' + (completed ? ' is-completed' : '');
    card.dataset.priority = task.priority;
    card.dataset.id = task.id;

    card.innerHTML = `
      <div class="task-card__top">
        <div>
          <h3 class="task-card__title">${escapeHtml(task.title)}</h3>
          <div class="task-card__course">${escapeHtml(task.course)}</div>
        </div>
        <span class="stamp stamp--${task.priority}">${task.priority}</span>
      </div>

      <div class="task-card__meta">
        <span class="task-card__due${overdue ? ' is-overdue' : ''}">
          ${overdue ? 'Overdue · ' : 'Due '}${formatDue(task.due)}
        </span>
        <span class="status-pill status-pill--${completed ? 'completed' : 'pending'}">
          ${completed ? 'Completed' : 'Pending'}
        </span>
      </div>

      <div class="task-card__actions">
        <button type="button" class="btn btn--ghost btn--small" data-action="toggle">
          ${completed ? 'Mark pending' : 'Mark done'}
        </button>
        <button type="button" class="btn btn--ghost btn--small" data-action="edit">Edit</button>
        <button type="button" class="btn btn--danger btn--small" data-action="delete">Delete</button>
      </div>
    `;

    return card;
  }

  function renderTaskList() {
    const visible = getVisibleTasks();
    taskListEl.innerHTML = '';

    if (visible.length === 0) {
      emptyStateEl.hidden = false;
      if (tasks.length === 0) {
        emptyStateEl.querySelector('.empty-shelf__title').textContent = 'The ledger is empty.';
        emptyStateEl.querySelector('.empty-shelf__body').textContent = 'File your first task using the form on the left.';
      } else {
        emptyStateEl.querySelector('.empty-shelf__title').textContent = 'Nothing filed here.';
        emptyStateEl.querySelector('.empty-shelf__body').textContent = 'Add a task above, or adjust your search and filter.';
      }
    } else {
      emptyStateEl.hidden = true;
      const frag = document.createDocumentFragment();
      visible.forEach(t => frag.appendChild(renderTaskCard(t)));
      taskListEl.appendChild(frag);
    }
  }

  function renderAll() {
    renderStats();
    renderTaskList();
  }

  /* ------------------------------------------------------------
     FORM: add / edit
     ------------------------------------------------------------ */
  function resetForm() {
    form.reset();
    taskIdField.value = '';
    priorityField.value = 'Medium';
    formTitle.textContent = 'New Entry';
    submitBtn.textContent = 'File Entry';
    cancelEditBtn.hidden = true;
    formError.hidden = true;
    formError.textContent = '';
  }

  function enterEditMode(task) {
    taskIdField.value = task.id;
    titleField.value = task.title;
    courseField.value = task.course;
    dueField.value = task.due;
    priorityField.value = task.priority;
    formTitle.textContent = 'Edit Entry';
    submitBtn.textContent = 'Save Changes';
    cancelEditBtn.hidden = false;
    formError.hidden = true;
    titleField.focus();
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const title = titleField.value.trim();
    const course = courseField.value.trim();
    const due = dueField.value;
    const priority = priorityField.value;

    if (!title || !course || !due) {
      showFormError('Please fill in the task, course and due date.');
      return;
    }

    const editingId = taskIdField.value;

    if (editingId) {
      const task = tasks.find(t => t.id === editingId);
      if (task) {
        task.title = title;
        task.course = course;
        task.due = due;
        task.priority = priority;
      }
    } else {
      tasks.push({
        id: uid(),
        title,
        course,
        due,
        priority,
        status: 'pending',
        createdAt: Date.now()
      });
    }

    saveTasks();
    resetForm();
    renderAll();
  });

  cancelEditBtn.addEventListener('click', resetForm);

  /* ------------------------------------------------------------
     TASK LIST ACTIONS (event delegation)
     ------------------------------------------------------------ */
  taskListEl.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;

    const card = e.target.closest('.task-card');
    const id = card.dataset.id;
    const action = btn.dataset.action;
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (action === 'toggle') {
      task.status = task.status === 'completed' ? 'pending' : 'completed';
      saveTasks();
      renderAll();
    } else if (action === 'edit') {
      enterEditMode(task);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (action === 'delete') {
      pendingDeleteId = id;
      confirmMessage.textContent = `Remove "${task.title}" from the ledger?`;
      confirmSlip.hidden = false;
      confirmDelete.focus();
    }
  });

  /* ------------------------------------------------------------
     DELETE CONFIRMATION
     ------------------------------------------------------------ */
  confirmCancel.addEventListener('click', function () {
    pendingDeleteId = null;
    confirmSlip.hidden = true;
  });

  confirmDelete.addEventListener('click', function () {
    if (pendingDeleteId) {
      tasks = tasks.filter(t => t.id !== pendingDeleteId);
      saveTasks();
      // If we were editing the task being deleted, reset the form
      if (taskIdField.value === pendingDeleteId) resetForm();
      renderAll();
    }
    pendingDeleteId = null;
    confirmSlip.hidden = true;
  });

  confirmSlip.addEventListener('click', function (e) {
    if (e.target === confirmSlip) {
      pendingDeleteId = null;
      confirmSlip.hidden = true;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !confirmSlip.hidden) {
      pendingDeleteId = null;
      confirmSlip.hidden = true;
    }
  });

  /* ------------------------------------------------------------
     SEARCH & FILTER
     ------------------------------------------------------------ */
  searchInput.addEventListener('input', function () {
    searchTerm = searchInput.value;
    renderTaskList();
  });

  filterTabs.forEach(tab => {
    tab.addEventListener('click', function () {
      filterTabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      currentFilter = tab.dataset.filter;
      renderTaskList();
    });
  });

  /* ------------------------------------------------------------
     INIT
     ------------------------------------------------------------ */
  function setTodayStamp() {
    const today = new Date();
    todayStamp.textContent = today.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function setDefaultDueDate() {
    // Default the date picker to today for convenience
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dueField.value = `${yyyy}-${mm}-${dd}`;
  }

  function init() {
    loadTasks();
    setTodayStamp();
    setDefaultDueDate();
    renderAll();
  }

  init();
})();
