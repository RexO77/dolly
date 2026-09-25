/*
 * Wrenly: one project's issues, a filter, an issue panel and a status menu.
 * Every load starts from the same state, so every take films the same page.
 */

const PEOPLE = {
  MO: { name: 'Maya Okafor', hue: 32 },
  TL: { name: 'Theo Lindqvist', hue: 205 },
  PR: { name: 'Priya Raman', hue: 150 },
  JW: { name: 'Jonas Weber', hue: 280 },
  IC: { name: 'Inês Carvalho', hue: 12 },
  SW: { name: 'Sam Whitfield', hue: 100 },
};

const LABELS = {
  Web: 'var(--blue)',
  Copy: 'var(--amber)',
  Design: 'var(--rose)',
  Email: 'var(--teal)',
  Billing: 'var(--violet)',
  Access: 'var(--green)',
};

/* In the order the status menu lists them. */
const STATUSES = [
  { key: 'todo', name: 'Todo', hotkey: 'T' },
  { key: 'progress', name: 'In progress', hotkey: 'P' },
  { key: 'review', name: 'In review', hotkey: 'R' },
  { key: 'done', name: 'Done', hotkey: 'D' },
];
/* In the order the list groups them: what is moving first. */
const GROUPS = ['progress', 'review', 'todo', 'done'].map((k) => STATUSES.find((s) => s.key === k));

const ISSUES = [
  { id: 'AUT-124', title: 'Rewrite the pricing page for the new tiers', status: 'review', who: 'PR', prio: 3, due: 'Oct 2', labels: ['Web', 'Copy'] },
  {
    id: 'AUT-131', title: 'Welcome email sequence: the first three emails', status: 'review', who: 'SW', prio: 3, due: 'Oct 4', labels: ['Email', 'Copy'],
    desc: 'Three emails over the first week: a welcome on day one, a nudge to invite the team on day three, and a short tour of views on day six. Plain text first, then the designed versions.',
    checks: [['Day one: welcome and first project', true], ['Day three: invite your team', true], ['Day six: a tour of views', true], ['Send test batch to the team', true]],
    activity: [['PR', 'left a comment: “Day three reads well, ship it.”', '2h'], ['SW', 'moved this to In review', '3h']],
  },
  { id: 'AUT-126', title: 'Onboarding checklist keeps progress across devices', status: 'progress', who: 'JW', prio: 3, due: 'Oct 6', labels: ['Web'] },
  { id: 'AUT-135', title: 'Compare plans table on small screens', status: 'progress', who: 'PR', prio: 2, due: 'Oct 7', labels: ['Web', 'Design'] },
  { id: 'AUT-127', title: 'Empty states for Projects and Inbox', status: 'progress', who: 'IC', prio: 2, due: 'Oct 8', labels: ['Design'] },
  { id: 'AUT-136', title: 'Import from CSV: the map columns step', status: 'progress', who: 'TL', prio: 1, due: 'Oct 9', labels: ['Web'] },
  { id: 'AUT-129', title: 'Annual billing toggle at checkout', status: 'todo', who: 'TL', prio: 3, due: 'Oct 9', labels: ['Billing'] },
  { id: 'AUT-132', title: 'Fix the focus order in the signup form', status: 'todo', who: 'JW', prio: 2, due: 'Oct 10', labels: ['Access'] },
  { id: 'AUT-133', title: 'Launch post for the blog', status: 'todo', who: 'MO', prio: 2, due: 'Oct 11', labels: ['Copy'] },
  { id: 'AUT-140', title: 'Refresh the help centre screenshots', status: 'todo', who: 'IC', prio: 1, due: 'Oct 12', labels: ['Design'] },
  { id: 'AUT-137', title: 'Customer quotes for the homepage', status: 'done', who: 'MO', prio: 2, due: 'Sep 26', labels: ['Copy'] },
  { id: 'AUT-138', title: 'Pricing FAQ', status: 'done', who: 'SW', prio: 1, due: 'Sep 27', labels: ['Web', 'Copy'] },
];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function statusIcon(key, size = 16) {
  const s = size;
  const c = s / 2;
  const r = s / 2 - 1.5;
  const color = { review: 'var(--blue)', progress: 'var(--amber)', todo: 'var(--todo)', done: 'var(--green)' }[key];
  const ring = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${color}" stroke-width="1.6"${key === 'todo' ? ' stroke-dasharray="2.4 2.2"' : ''}/>`;
  let fill = '';
  if (key === 'progress') fill = `<path d="M${c} ${c - r + 2.6}A${r - 2.6} ${r - 2.6} 0 0 1 ${c} ${c + r - 2.6}Z" fill="${color}"/>`;
  if (key === 'review') fill = `<path d="M${c} ${c}V${c - r + 2.6}A${r - 2.6} ${r - 2.6} 0 1 1 ${c - r + 2.6} ${c}Z" fill="${color}"/>`;
  if (key === 'done') {
    return `<svg class="status-icon" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${c - 0.5}" fill="${color}"/><path d="M${c - 3.2} ${c + 0.2}l2.2 2.2 4.2-4.4" fill="none" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return `<svg class="status-icon" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" aria-hidden="true">${ring}${fill}</svg>`;
}

function prioIcon(n) {
  const bars = [0, 1, 2].map((i) => `<rect x="${2 + i * 5}" y="${11 - i * 3}" width="3" height="${4 + i * 3}" rx="1" fill="currentColor" opacity="${i < n ? 1 : 0.28}"/>`).join('');
  return `<svg class="prio" width="18" height="16" viewBox="0 0 18 16" aria-label="Priority ${['low', 'medium', 'high'][n - 1]}">${bars}</svg>`;
}

const avatar = (who) => `<span class="avatar" style="--hue: ${PEOPLE[who].hue}" title="${PEOPLE[who].name}">${who}</span>`;
const label = (l) => `<span class="label" style="--c: ${LABELS[l]}">${l}</span>`;

let filter = 'all';
let openId = null;

function render() {
  const list = $('#list');
  list.innerHTML = GROUPS.map((s) => {
    const rows = ISSUES.filter((i) => i.status === s.key);
    return `<section class="collapse group" data-group="${s.key}"><div>
      <h3 class="group-head">${statusIcon(s.key, 14)}${s.name} <span class="n">${rows.length}</span></h3>
      ${ISSUES.map((i) => `<div class="collapse" data-row="${i.id}" data-status="${i.status}"${i.status === s.key ? '' : ' hidden'}><div>
        <div class="row" data-id="${i.id}" role="button" tabindex="0" aria-label="${esc(i.title)}">
          <span data-icon>${statusIcon(i.status)}</span>
          <span class="id mono">${i.id}</span>
          <span class="title">${esc(i.title)}</span>
          <span class="labels">${i.labels.map(label).join('')}</span>
          ${prioIcon(i.prio)}
          <span class="due">${i.due}</span>
          ${avatar(i.who)}
        </div></div></div>`).join('')}
    </div></section>`;
  }).join('');
  counts();
  applyFilter();
}

function counts() {
  const n = (k) => ISSUES.filter((i) => k === 'all' || i.status === k).length;
  document.querySelectorAll('[data-count]').forEach((el) => { el.textContent = n(el.dataset.count); });
  document.querySelectorAll('[data-group]').forEach((g) => { $('.group-head .n', g).textContent = n(g.dataset.group); });
  const done = n('done');
  $('#done-count').textContent = done;
  $('#bar-fill').style.setProperty('--p', `${(done / ISSUES.length) * 100}%`);
}

/* A row lives in its status's group; the others keep a hidden copy so a status change can move it without a jump. */
function applyFilter() {
  document.querySelectorAll('[data-group]').forEach((g) => {
    const key = g.dataset.group;
    const has = ISSUES.some((i) => i.status === key);
    g.classList.toggle('is-hidden', !has || (filter !== 'all' && filter !== key));
    g.querySelectorAll('[data-row]').forEach((r) => {
      const issue = ISSUES.find((i) => i.id === r.dataset.row);
      const here = issue.status === key;
      r.hidden = false;
      r.classList.toggle('is-hidden', !here);
      r.inert = !here;
    });
  });
  document.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-selected', String(c.dataset.filter === filter)));
}

function setFilter(next) {
  filter = next;
  applyFilter();
}

function openIssue(id) {
  const issue = ISSUES.find((i) => i.id === id);
  openId = id;
  document.querySelectorAll('.row').forEach((r) => r.classList.toggle('is-open', r.dataset.id === id));
  $('#p-id').textContent = issue.id;
  $('#p-title').textContent = issue.title;
  $('#p-assignee').innerHTML = `${avatar(issue.who)} ${PEOPLE[issue.who].name}`;
  $('#p-priority').innerHTML = `${prioIcon(issue.prio)} ${['Low', 'Medium', 'High'][issue.prio - 1]}`;
  $('#p-due').textContent = `${issue.due}, 2026`;
  $('#p-labels').innerHTML = issue.labels.map(label).join('');
  $('#p-desc').textContent = issue.desc ?? 'No description yet.';
  $('#p-checks').innerHTML = (issue.checks ?? []).map(([t, done]) => `<div class="check${done ? ' is-done' : ''}"><span class="box">${done ? '<svg width="10" height="10" viewBox="0 0 10 10"><path d="m2 5 2 2 4-4.2" fill="none" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</span>${esc(t)}</div>`).join('');
  $('#p-activity').innerHTML = (issue.activity ?? []).map(([who, what, when]) => `<li>${avatar(who)}<span><b>${PEOPLE[who].name}</b> ${esc(what)}<time>${when}</time></span></li>`).join('');
  statusButton(issue);
  const panel = $('#panel');
  panel.classList.add('is-open');
  panel.removeAttribute('inert');
  panel.setAttribute('aria-hidden', 'false');
}

function closeIssue() {
  openId = null;
  closeMenu();
  const panel = $('#panel');
  panel.classList.remove('is-open');
  panel.setAttribute('inert', '');
  panel.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.row.is-open').forEach((r) => r.classList.remove('is-open'));
}

function statusButton(issue) {
  const s = STATUSES.find((x) => x.key === issue.status);
  const btn = $('#status-btn');
  btn.innerHTML = `${statusIcon(issue.status)}<span>${s.name}</span>`;
  btn.classList.toggle('is-done', issue.status === 'done');
}

function openMenu() {
  const issue = ISSUES.find((i) => i.id === openId);
  const menu = $('#status-menu');
  menu.innerHTML = STATUSES.map((s) => `<button class="menu-item" role="menuitemradio" aria-checked="${s.key === issue.status}" data-status="${s.key}">${statusIcon(s.key)}<span>${s.name}</span><span class="key">${s.hotkey}</span></button>`).join('');
  menu.hidden = false;
  $('#status-btn').setAttribute('aria-expanded', 'true');
}

function closeMenu() {
  $('#status-menu').hidden = true;
  $('#status-btn').setAttribute('aria-expanded', 'false');
}

let toastTimer;
function toast(html) {
  $('#toast-text').innerHTML = html;
  const t = $('#toast');
  t.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-shown'), 5200);
}

function setStatus(key) {
  const issue = ISSUES.find((i) => i.id === openId);
  closeMenu();
  if (issue.status === key) return;
  const from = STATUSES.find((s) => s.key === issue.status).name;
  issue.status = key;
  const to = STATUSES.find((s) => s.key === key).name;
  statusButton(issue);
  $('#status-btn .status-icon').classList.add('pop');
  document.querySelectorAll(`[data-row="${issue.id}"] [data-icon]`).forEach((el) => {
    el.innerHTML = statusIcon(key);
    el.firstChild.classList.add('pop');
  });
  const li = document.createElement('li');
  li.className = 'is-new';
  li.innerHTML = `${avatar('MO')}<span><b>Maya Okafor</b> moved this from ${from} to ${to}<time>just now</time></span>`;
  $('#p-activity').prepend(li);
  counts();
  /* The row stays where it is a moment, so the change reads before it moves. */
  setTimeout(applyFilter, 900);
  toast(`<b>${issue.id}</b> moved to ${to}`);
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (chip) return setFilter(chip.dataset.filter);
  const row = e.target.closest('.row');
  if (row) return openIssue(row.dataset.id);
  if (e.target.closest('#panel-close')) return closeIssue();
  if (e.target.closest('#status-btn')) return $('#status-menu').hidden ? openMenu() : closeMenu();
  const item = e.target.closest('.menu-item');
  if (item) return setStatus(item.dataset.status);
  if (!e.target.closest('.menu')) closeMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return openId && closeIssue();
  const row = e.target.closest?.('.row');
  if (row && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openIssue(row.dataset.id);
  }
});

render();
