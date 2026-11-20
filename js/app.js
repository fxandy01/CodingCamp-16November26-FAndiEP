'use strict';

/* ---------- Storage helpers ---------- */
const KEYS = { tasks: 'pd_tasks', links: 'pd_links', minutes: 'pd_minutes', sort: 'pd_sort',
  stats: 'pd_stats', focus: 'pd_focus', theme: 'pd_theme' };

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable or full: keep running without persistence */
  }
}

const $ = (id) => document.getElementById(id);

function dateKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

const todayKey = () => dateKey(new Date());

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

/* ---------- Theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

function initTheme() {
  const saved = load(KEYS.theme, null);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  $('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    save(KEYS.theme, next);
    applyTheme(next);
  });
}

/* ---------- Greeting ---------- */
function updateClock() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Good Night';
  if (hour >= 5 && hour < 12) greeting = 'Good Morning';
  else if (hour >= 12 && hour < 18) greeting = 'Good Afternoon';
  else if (hour >= 18 && hour < 22) greeting = 'Good Evening';

  $('time').textContent = now.toLocaleTimeString();
  $('date').textContent = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  $('greeting').textContent = greeting;

  if (stats.date !== todayKey()) {
    rollStats();
    renderStats();
    renderTasks();
  }
}

/* ---------- Daily stats ---------- */
const BREAK_MINUTES = 5;
const LONG_BREAK_MINUTES = 15;
const SESSIONS_PER_CYCLE = 4;

let stats = load(KEYS.stats, { date: '', sessions: 0, minutes: 0, streak: 0, lastActive: '', cycle: 0 });

function rollStats() {
  if (stats.date === todayKey()) return;
  stats.date = todayKey();
  stats.sessions = 0;
  stats.minutes = 0;
  save(KEYS.stats, stats);
}

function currentStreak() {
  const active = stats.lastActive === todayKey() || stats.lastActive === yesterdayKey();
  return active ? stats.streak : 0;
}

function tasksDoneToday() {
  const today = todayKey();
  return tasks.filter((t) => t.done && t.doneDate === today).length;
}

function renderStats() {
  $('stat-sessions').textContent = stats.sessions;
  $('stat-minutes').textContent = stats.minutes;
  $('stat-done').textContent = tasksDoneToday();
  $('stat-streak').textContent = currentStreak();
}

function recordFocusSession() {
  rollStats();
  stats.sessions += 1;
  stats.minutes += timerMinutes;
  stats.cycle += 1;

  if (stats.lastActive !== todayKey()) {
    stats.streak = stats.lastActive === yesterdayKey() ? stats.streak + 1 : 1;
    stats.lastActive = todayKey();
  }
  save(KEYS.stats, stats);

  const task = tasks.find((t) => t.id === focusTaskId);
  if (task) {
    task.sessions = (task.sessions || 0) + 1;
    save(KEYS.tasks, tasks);
    renderTasks();
  }
  renderStats();
}

/* ---------- Focus timer ---------- */
let timerMinutes = load(KEYS.minutes, 25);
let mode = 'focus'; // 'focus' | 'break' | 'long'
let remaining = timerMinutes * 60;
let timerId = null;

const MODE_LABELS = { focus: 'Focus', break: 'Short break', long: 'Long break' };

function modeMinutes() {
  if (mode === 'break') return BREAK_MINUTES;
  if (mode === 'long') return LONG_BREAK_MINUTES;
  return timerMinutes;
}

function renderTimer() {
  const m = String(Math.floor(remaining / 60)).padStart(2, '0');
  const s = String(remaining % 60).padStart(2, '0');
  $('timer-display').textContent = `${m}:${s}`;
  $('mode-label').textContent = MODE_LABELS[mode];
  document.title = `${m}:${s} - ${MODE_LABELS[mode]}`;
}

function renderFocusTask() {
  const el = $('focus-task');
  if (mode !== 'focus') {
    el.textContent = 'Take a break and rest your eyes.';
    return;
  }
  const task = tasks.find((t) => t.id === focusTaskId);
  el.textContent = task
    ? `Working on: ${task.text} (🍅 ${task.sessions || 0})`
    : 'No focus task selected. Pick one with the Focus button below.';
}

function setMode(newMode) {
  mode = newMode;
  remaining = modeMinutes() * 60;
  renderTimer();
  renderFocusTask();
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function finishSession() {
  stopTimer();
  let message;
  if (mode === 'focus') {
    recordFocusSession();
    const long = stats.cycle % SESSIONS_PER_CYCLE === 0;
    setMode(long ? 'long' : 'break');
    message = long ? 'Great work! Time for a long break.' : 'Focus session complete! Time for a short break.';
  } else {
    setMode('focus');
    message = 'Break is over. Ready for the next focus session?';
  }
  // Delay so the new timer state is painted before the blocking alert.
  setTimeout(() => alert(message), 50);
}

function startTimer() {
  if (timerId !== null || remaining <= 0) return;
  timerId = setInterval(() => {
    remaining -= 1;
    renderTimer();
    if (remaining <= 0) finishSession();
  }, 1000);
}

function resetTimer() {
  stopTimer();
  remaining = modeMinutes() * 60;
  renderTimer();
}

function setTimerMinutes(event) {
  event.preventDefault();
  const value = Math.floor(Number($('timer-minutes').value));
  if (!value || value < 1 || value > 180) return;
  timerMinutes = value;
  save(KEYS.minutes, value);
  stopTimer();
  setMode('focus');
}

/* ---------- To-do list ---------- */
let tasks = load(KEYS.tasks, []);
let sortMode = load(KEYS.sort, 'newest');
let editingId = null;
let focusTaskId = load(KEYS.focus, null);

function normalize(text) {
  return text.trim().toLowerCase();
}

function isDuplicate(text, ignoreId) {
  const target = normalize(text);
  return tasks.some((t) => t.id !== ignoreId && normalize(t.text) === target);
}

function sortedTasks() {
  const list = [...tasks];
  const byText = (a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
  switch (sortMode) {
    case 'oldest': return list.sort((a, b) => a.id - b.id);
    case 'az': return list.sort(byText);
    case 'za': return list.sort((a, b) => byText(b, a));
    case 'status': return list.sort((a, b) => a.done - b.done || b.id - a.id);
    default: return list.sort((a, b) => b.id - a.id);
  }
}

function showTaskMessage(text) {
  $('task-message').textContent = text;
}

function makeButton(label, className, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.className = `btn small ${className}`.trim();
  btn.addEventListener('click', onClick);
  return btn;
}

function renderTasks() {
  const list = $('task-list');
  list.innerHTML = '';

  sortedTasks().forEach((task) => {
    const li = document.createElement('li');
    if (task.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.setAttribute('aria-label', 'Mark task as done');
    checkbox.addEventListener('change', () => toggleTask(task.id));
    li.appendChild(checkbox);

    if (editingId === task.id) {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'edit-input';
      input.value = task.text;
      input.maxLength = 100;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEdit(task.id, input.value);
        if (e.key === 'Escape') cancelEdit();
      });
      li.appendChild(input);
      li.appendChild(makeButton('Save', 'primary', () => saveEdit(task.id, input.value)));
      li.appendChild(makeButton('Cancel', '', cancelEdit));
      list.appendChild(li);
      input.focus();
    } else {
      const span = document.createElement('span');
      span.className = 'task-text';
      if (task.id === focusTaskId) span.classList.add('focused');
      span.textContent = task.text;
      li.appendChild(span);
      if (task.sessions) {
        const count = document.createElement('span');
        count.className = 'pomodoros';
        count.textContent = `🍅 ${task.sessions}`;
        count.title = 'Completed focus sessions';
        li.appendChild(count);
      }
      const focusBtn = makeButton('Focus', task.id === focusTaskId ? 'active' : '', () => toggleFocus(task.id));
      focusBtn.setAttribute('aria-pressed', String(task.id === focusTaskId));
      li.appendChild(focusBtn);
      li.appendChild(makeButton('Edit', '', () => startEdit(task.id)));
      li.appendChild(makeButton('Delete', 'danger', () => deleteTask(task.id)));
      list.appendChild(li);
    }
  });
}

function addTask(event) {
  event.preventDefault();
  const text = $('task-input').value.trim();
  if (!text) return;
  if (isDuplicate(text)) {
    showTaskMessage('This task already exists.');
    return;
  }
  tasks.push({ id: Date.now(), text, done: false });
  save(KEYS.tasks, tasks);
  $('task-input').value = '';
  showTaskMessage('');
  renderTasks();
}

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.done = !task.done;
  task.doneDate = task.done ? todayKey() : null;
  if (task.done && focusTaskId === id) setFocusTask(null);
  save(KEYS.tasks, tasks);
  renderTasks();
  renderStats();
  renderFocusTask();
}

function setFocusTask(id) {
  focusTaskId = id;
  save(KEYS.focus, id);
}

function toggleFocus(id) {
  setFocusTask(focusTaskId === id ? null : id);
  renderTasks();
  renderFocusTask();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  if (editingId === id) editingId = null;
  if (focusTaskId === id) setFocusTask(null);
  save(KEYS.tasks, tasks);
  renderTasks();
  renderStats();
  renderFocusTask();
}

function startEdit(id) {
  editingId = id;
  showTaskMessage('');
  renderTasks();
}

function cancelEdit() {
  editingId = null;
  showTaskMessage('');
  renderTasks();
}

function saveEdit(id, value) {
  const text = value.trim();
  if (!text) {
    showTaskMessage('Task cannot be empty.');
    return;
  }
  if (isDuplicate(text, id)) {
    showTaskMessage('This task already exists.');
    return;
  }
  const task = tasks.find((t) => t.id === id);
  if (task) task.text = text;
  editingId = null;
  save(KEYS.tasks, tasks);
  showTaskMessage('');
  renderTasks();
  renderFocusTask();
}

function changeSort() {
  sortMode = $('task-sort').value;
  save(KEYS.sort, sortMode);
  renderTasks();
}

/* ---------- Quick links ---------- */
let links = load(KEYS.links, [
  { id: 1, name: 'Google', url: 'https://www.google.com' },
  { id: 2, name: 'GitHub', url: 'https://github.com' }
]);

function normalizeUrl(value) {
  const raw = value.trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.includes('.') ? url.href : null;
  } catch (e) {
    return null;
  }
}

function renderLinks() {
  const box = $('link-list');
  box.innerHTML = '';
  links.forEach((link) => {
    const wrap = document.createElement('div');
    wrap.className = 'link-item';

    const a = document.createElement('a');
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = link.name;

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '×';
    del.setAttribute('aria-label', `Remove ${link.name}`);
    del.addEventListener('click', () => deleteLink(link.id));

    wrap.append(a, del);
    box.appendChild(wrap);
  });
}

function addLink(event) {
  event.preventDefault();
  const name = $('link-name').value.trim();
  const url = normalizeUrl($('link-url').value);
  if (!name) return;
  if (!url) {
    $('link-message').textContent = 'Please enter a valid URL.';
    return;
  }
  links.push({ id: Date.now(), name, url });
  save(KEYS.links, links);
  $('link-name').value = '';
  $('link-url').value = '';
  $('link-message').textContent = '';
  renderLinks();
}

function deleteLink(id) {
  links = links.filter((l) => l.id !== id);
  save(KEYS.links, links);
  renderLinks();
}

/* ---------- Init ---------- */
function init() {
  initTheme();
  rollStats();
  updateClock();
  setInterval(updateClock, 1000);

  $('timer-minutes').value = timerMinutes;
  renderTimer();
  renderFocusTask();
  renderStats();
  $('timer-start').addEventListener('click', startTimer);
  $('timer-stop').addEventListener('click', stopTimer);
  $('timer-reset').addEventListener('click', resetTimer);
  $('timer-form').addEventListener('submit', setTimerMinutes);

  $('task-sort').value = sortMode;
  $('task-sort').addEventListener('change', changeSort);
  $('task-form').addEventListener('submit', addTask);
  renderTasks();

  $('link-form').addEventListener('submit', addLink);
  renderLinks();
}

init();
