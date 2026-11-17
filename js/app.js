'use strict';

/* ---------- Storage helpers ---------- */
const KEYS = { tasks: 'pd_tasks', links: 'pd_links', minutes: 'pd_minutes', sort: 'pd_sort' };

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
}

/* ---------- Focus timer ---------- */
let timerMinutes = load(KEYS.minutes, 25);
let remaining = timerMinutes * 60;
let timerId = null;

function renderTimer() {
  const m = String(Math.floor(remaining / 60)).padStart(2, '0');
  const s = String(remaining % 60).padStart(2, '0');
  $('timer-display').textContent = `${m}:${s}`;
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function startTimer() {
  if (timerId !== null || remaining <= 0) return;
  timerId = setInterval(() => {
    remaining -= 1;
    renderTimer();
    if (remaining <= 0) {
      stopTimer();
      alert('Time is up!');
    }
  }, 1000);
}

function resetTimer() {
  stopTimer();
  remaining = timerMinutes * 60;
  renderTimer();
}

function setTimerMinutes(event) {
  event.preventDefault();
  const value = Math.floor(Number($('timer-minutes').value));
  if (!value || value < 1 || value > 180) return;
  timerMinutes = value;
  save(KEYS.minutes, value);
  resetTimer();
}

/* ---------- To-do list ---------- */
let tasks = load(KEYS.tasks, []);
let sortMode = load(KEYS.sort, 'newest');
let editingId = null;

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
      span.textContent = task.text;
      li.appendChild(span);
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
  save(KEYS.tasks, tasks);
  renderTasks();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  if (editingId === id) editingId = null;
  save(KEYS.tasks, tasks);
  renderTasks();
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
  updateClock();
  setInterval(updateClock, 1000);

  $('timer-minutes').value = timerMinutes;
  renderTimer();
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
