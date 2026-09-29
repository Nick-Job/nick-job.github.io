/* ============================================================
   个人工作台 app.js
   零依赖单页应用。数据存于仓库 data/*.json：
   读取 = 相对路径 fetch；写入 = GitHub Contents API（令牌存本机 localStorage）。
   ============================================================ */
'use strict';

/* ---------- 小工具 ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const b64 = (str) => { const b = new TextEncoder().encode(str); let s = ''; b.forEach((x) => s += String.fromCharCode(x)); return btoa(s); };
const debounceStore = {};

function todayISO() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtMD(iso) { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${+m}/${+d}`; }
function fmtCn(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+m}月${+d}日`; }
function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime(); if (isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  const d = new Date(iso), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yst = new Date(now); yst.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return hm;
  if (sameDay(d, yst)) return '昨天 ' + hm;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const PRIO = { '高': 'p-high', '中': 'p-mid', '低': 'p-low' };
const PRIO_ORD = { '高': 0, '中': 1, '低': 2 };
const PLAT_CLS = { '公众号': 'p-gzh', '小红书': 'p-xhs', '抖音': 'p-dy' };
const PLAT_CLS2 = { '公众号': 'e-gzh', '小红书': 'e-xhs', '抖音': 'e-dy' };
const LINK_NAME = { topics: '选题中枢', prompts: '提示词库', sites: '网站收藏夹' };

/* ---------- 图标（stroke 基元组合，统一 1.8 线宽） ---------- */
const ICONS = {
  check: '<polyline points="4 10.5 8.5 15 16 5.5"/>',
  plus: '<line x1="10" y1="4" x2="10" y2="16"/><line x1="4" y1="10" x2="16" y2="10"/>',
  x: '<line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/>',
  trash: '<path d="M4.5 6h11"/><path d="M8 6V4.5h4V6"/><path d="M6.2 6l.7 9.5h6.2L13.8 6"/><path d="M9 9v3.5M11 9v3.5"/>',
  star: '<path d="M10 3.2l2.2 4.5 5 .73-3.6 3.5.85 4.95L10 14.55 5.55 16.88l.85-4.95-3.6-3.5 5-.73z"/>',
  copy: '<rect x="7.5" y="7.5" width="8.5" height="8.5" rx="2"/><path d="M12.5 7.5V5.8c0-1.27-1.03-2.3-2.3-2.3H5.8c-1.27 0-2.3 1.03-2.3 2.3v4.4c0 1.27 1.03 2.3 2.3 2.3h1.7"/>',
  calendar: '<rect x="3.5" y="5" width="13" height="11.5" rx="2"/><line x1="3.5" y1="8.7" x2="16.5" y2="8.7"/><line x1="7" y1="3.5" x2="7" y2="6.2"/><line x1="13" y1="3.5" x2="13" y2="6.2"/>',
  chevL: '<polyline points="12 5 7 10 12 15"/>',
  chevR: '<polyline points="8 5 13 10 8 15"/>',
  edit: '<path d="M13.1 4.4l2.5 2.5L7.2 15.3l-3.3.8.8-3.3z"/>',
  sliders: '<line x1="4" y1="6" x2="9.8" y2="6"/><line x1="14.2" y1="6" x2="16" y2="6"/><circle cx="12" cy="6" r="1.9"/><line x1="4" y1="14" x2="5.8" y2="14"/><line x1="10.2" y1="14" x2="16" y2="14"/><circle cx="8" cy="14" r="1.9"/>',
  sun: '<circle cx="10" cy="10" r="3.1"/><path d="M10 3.2v1.9M10 15v1.8M3.2 10H5M15 10h1.8M5.3 5.3l1.3 1.3M13.4 13.4l1.3 1.3M14.7 5.3l-1.3 1.3M6.6 13.4l-1.3 1.3"/>',
  moon: '<path d="M16.2 12.3A6.6 6.6 0 0 1 7.7 3.8a6.6 6.6 0 1 0 8.5 8.5z"/>',
  refresh: '<path d="M15.7 10.4a5.7 5.7 0 1 1-1.7-4.3"/><polyline points="14.5 3.4 14.5 6.5 11.4 6.5"/>',
  external: '<path d="M8.5 5H5.8A1.8 1.8 0 0 0 4 6.8v7.4A1.8 1.8 0 0 0 5.8 16h7.4a1.8 1.8 0 0 0 1.8-1.8v-2.7"/><polyline points="11.5 4 16 4 16 8.5"/><line x1="16" y1="4" x2="9.8" y2="10.2"/>',
  arrowR: '<line x1="4" y1="10" x2="15" y2="10"/><polyline points="11 6 15 10 11 14"/>',
  bulb: '<path d="M10 3.4a5.1 5.1 0 0 1 5.1 5.1c0 1.9-1 3-1.9 4.1-.6.7-1 1.5-1.1 2.4H7.9c-.1-.9-.5-1.7-1.1-2.4-.9-1.1-1.9-2.2-1.9-4.1A5.1 5.1 0 0 1 10 3.4z"/><line x1="8" y1="17.6" x2="12" y2="17.6"/>',
  board: '<rect x="3.5" y="4.5" width="13" height="11" rx="2"/><line x1="8.1" y1="4.5" x2="8.1" y2="15.5"/><line x1="12.7" y1="4.5" x2="12.7" y2="15.5"/>',
  listCheck: '<path d="M3.6 5.2l1.3 1.3 2-2.2"/><line x1="9.8" y1="5.5" x2="16.4" y2="5.5"/><path d="M3.6 10.2l1.3 1.3 2-2.2"/><line x1="9.8" y1="10.5" x2="16.4" y2="10.5"/><path d="M3.6 15.2l1.3 1.3 2-2.2"/><line x1="9.8" y1="15.5" x2="16.4" y2="15.5"/>',
  sparkle: '<path d="M10 3.4l1.7 4.5 4.5 1.7-4.5 1.7L10 15.8 8.3 11.3 3.8 9.6l4.5-1.7z"/>',
  menu: '<line x1="4" y1="5.5" x2="16" y2="5.5"/><line x1="4" y1="10" x2="16" y2="10"/><line x1="4" y1="14.5" x2="16" y2="14.5"/>',
  clock: '<circle cx="10" cy="10" r="6.5"/><polyline points="10 6.3 10 10 12.6 11.4"/>',
  alert: '<circle cx="10" cy="10" r="6.5"/><line x1="10" y1="6.6" x2="10" y2="10.6"/><circle cx="10" cy="13.4" r=".4" fill="currentColor"/>',
  globe: '<circle cx="10" cy="10" r="6.5"/><path d="M3.5 10h13"/><path d="M10 3.5c2 1.9 3 4 3 6.5s-1 4.6-3 6.5c-2-1.9-3-4-3-6.5s1-4.6 3-6.5z"/>',
};
const ic = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- 全局状态 ---------- */
const DB_FILES = ['tasks', 'topics', 'prompts', 'sites', 'ideas'];
const state = {
  db: {}, shas: {}, loaded: false, offline: false,
  sync: 'init', lastErr: '',
  token: localStorage.getItem('wb_token') || '',
  route: { mod: 'todo', view: 'focus' },
  promptFilter: 'all', promptSearch: '',
  siteFilter: 'all',
  ideaFilter: 'open',
  cal: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(),
};
function repoCfg() {
  const h = location.hostname;
  if (h.endsWith('.github.io')) {
    const o = h.slice(0, -10);
    return { owner: o, repo: o + '.github.io' };
  }
  try { const s = JSON.parse(localStorage.getItem('wb_repo') || 'null'); if (s && s.owner && s.repo) return s; } catch (e) {}
  return { owner: 'Nick-Job', repo: 'nick-job.github.io' };
}

/* ---------- GitHub 同步 ---------- */
async function gh(path, opts = {}) {
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  const res = await fetch('https://api.github.com' + path, { ...opts, headers });
  if (!res.ok) { const e = new Error('GitHub API ' + res.status); e.status = res.status; e.body = await res.text().catch(() => ''); throw e; }
  return res.json();
}
async function loadFile(name) {
  try {
    const res = await fetch(`data/${name}.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    state.db[name] = await res.json();
    localStorage.setItem('wb_cache_' + name, JSON.stringify(state.db[name]));
    return true;
  } catch (e) {
    const c = localStorage.getItem('wb_cache_' + name);
    if (c) { try { state.db[name] = JSON.parse(c); return false; } catch (e2) {} }
    state.db[name] = name === 'topics' ? { statuses: ['待评估', '已立项', '制作中', '待发布', '已发布', '已复盘'], signals: [], items: [] } : { items: [] };
    return false;
  }
}
async function loadAll() {
  state.sync = 'busy'; updateSyncUI();
  const rs = await Promise.all(DB_FILES.map(loadFile));
  state.offline = rs.some((r) => !r);
  state.shas = {};
  state.loaded = true;
  state.sync = state.token ? 'ok' : 'local';
  updateSyncUI();
}
function scheduleSave(name) {
  localStorage.setItem('wb_cache_' + name, JSON.stringify(state.db[name]));
  if (!state.token) { state.sync = 'local'; updateSyncUI(); return; }
  clearTimeout(debounceStore[name]);
  debounceStore[name] = setTimeout(() => pushFile(name), 900);
}
async function pushFile(name, isRetry = false) {
  state.sync = 'busy'; updateSyncUI();
  const cfg = repoCfg();
  try {
    let sha = state.shas[name];
    if (sha === undefined) {
      try { const j = await gh(`/repos/${cfg.owner}/${cfg.repo}/contents/data/${name}.json?ref=main`); sha = j.sha; }
      catch (e) { if (e.status !== 404) throw e; sha = null; }
    }
    const body = {
      message: '工作台: 更新 ' + name + '.json',
      content: b64(JSON.stringify(state.db[name], null, 2) + '\n'),
      branch: 'main',
    };
    if (sha) body.sha = sha;
    const j = await gh(`/repos/${cfg.owner}/${cfg.repo}/contents/data/${name}.json`, { method: 'PUT', body: JSON.stringify(body) });
    state.shas[name] = j.content.sha;
    state.sync = 'ok'; state.lastErr = '';
  } catch (e) {
    if ((e.status === 409 || e.status === 422) && !isRetry) { state.shas[name] = undefined; return pushFile(name, true); }
    state.sync = 'err'; state.lastErr = e.message;
    toast('同步失败：' + e.message, 'err');
  }
  updateSyncUI();
}

/* ---------- toast / modal / confirm ---------- */
function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = (kind === 'err' ? ic('alert') : ic('check')) + esc(msg);
  $('#toast-root').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, 2000);
  setTimeout(() => t.remove(), 2300);
}
function openModal({ title, body, foot, onMount }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-scrim" data-act="scrim"><div class="modal" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-act="closeModal" aria-label="关闭">${ic('x')}</button></div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div></div>`;
  if (onMount) onMount(root);
}
function closeModal() { $('#modal-root').innerHTML = ''; }
function confirmDlg(msg, onOk) {
  openModal({
    title: '确认删除',
    body: `<p style="margin:4px 0 8px;color:var(--text-2)">${esc(msg)}</p>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" id="cf-ok" style="background:var(--danger)">删除</button>`,
  });
  $('#cf-ok').addEventListener('click', () => { closeModal(); onOk(); });
}

/* ---------- 主题 ---------- */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('wb_theme', t);
}
applyTheme(localStorage.getItem('wb_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

/* ---------- 渲染：侧栏 ---------- */
function navCounts() {
  const d = state.db;
  const tasks = d.tasks?.items || [];
  const topics = d.topics?.items || [];
  return {
    todo: tasks.filter((t) => !t.done).length,
    topics: topics.filter((t) => t.status !== '已发布' && t.status !== '已复盘').length,
    prompts: (d.prompts?.items || []).length,
    sites: (d.sites?.items || []).length,
    ideas: (d.ideas?.items || []).filter((i) => !i.processed).length,
  };
}
const MODULES = [
  { mod: 'todo', icon: 'listCheck', label: '今日待办' },
  { mod: 'topics', icon: 'board', label: '选题中枢' },
  { mod: 'prompts', icon: 'sparkle', label: '提示词库' },
  { mod: 'sites', icon: 'globe', label: '网站收藏夹' },
  { mod: 'ideas', icon: 'bulb', label: '灵感速记' },
];
function syncInfo() {
  const cfg = repoCfg();
  const map = {
    ok: ['ok', '已同步', cfg.repo],
    busy: ['busy', '同步中', cfg.repo],
    err: ['err', '同步失败', state.lastErr || '请检查令牌'],
    local: ['local', '本地模式', '未配置令牌，改动未上传'],
    init: ['busy', '加载中', cfg.repo],
  };
  const [cls, label, sub] = map[state.sync] || map.init;
  return `<button class="sync-pill ${cls}" data-act="syncReload" title="点击重新拉取数据">
    <span class="dot"></span><span><b>${label}</b><br>${esc(sub)}</span></button>`;
}
function renderSidebar() {
  const c = navCounts();
  const items = MODULES.map((m) => `
    <button class="nav-item ${state.route.mod === m.mod ? 'active' : ''}" data-act="nav" data-mod="${m.mod}">
      ${ic(m.icon)}<span>${m.label}</span>
      <span class="nv-count num">${c[m.mod]}</span>
    </button>`).join('');
  const themeIcon = document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon';
  $('#sidebar').innerHTML = `
    <div class="brand"><div class="brand-mark">${ic('check')}</div>
      <div><div class="brand-name">个人工作台</div><div class="brand-sub">${esc(repoCfg().owner)} 的内容创作台</div></div>
    </div>
    <nav class="nav"><div class="nav-label">模块</div>${items}</nav>
    <div class="side-foot">
      ${syncInfo()}
      <div class="side-actions">
        <button class="side-btn" data-act="toggleTheme">${ic(themeIcon)}<span>主题</span></button>
        <button class="side-btn" data-act="openSettings">${ic('sliders')}<span>设置</span></button>
      </div>
    </div>`;
}
function updateSyncUI() { const el = $('.sync-pill'); if (el) el.outerHTML = syncInfo(); }

/* ---------- 渲染：骨架 ---------- */
function head(title, sub, actions) {
  return `<div class="page-head">
    <div class="page-title"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <div class="head-actions">${actions || ''}</div>
  </div>`;
}
function tabsHTML(mod, tabs, cur) {
  return `<div class="tabs" role="tablist">${tabs.map(([v, label]) =>
    `<button class="tab ${cur === v ? 'active' : ''}" data-act="tab" data-mod="${mod}" data-view="${v}" role="tab">${label}</button>`).join('')}</div>`;
}
function emptyHTML(icon, title, hint) {
  return `<div class="empty"><div class="e-ic">${ic(icon)}</div><div class="e-t">${title}</div><div class="e-s">${hint}</div></div>`;
}
function skelHTML(n = 4) { return `<div style="padding:16px 18px">${Array.from({ length: n }, () => '<div class="skel skel-row"></div>').join('')}</div>`; }

function renderView() {
  const v = $('#view');
  if (!state.loaded) { v.innerHTML = head('加载中') + `<div class="panel section-gap">${skelHTML()}</div>`; return; }
  const fns = { todo: viewTodo, topics: viewTopics, prompts: viewPrompts, sites: viewSites, ideas: viewIdeas };
  v.innerHTML = `<div class="view-body">${(fns[state.route.mod] || viewTodo)()}</div>`;
  const bar = `<div class="mobile-bar"><button class="icon-btn" data-act="openSide" aria-label="菜单">${ic('menu')}</button>
    <span class="mb-title">${MODULES.find((m) => m.mod === state.route.mod)?.label || ''}</span></div>`;
  v.insertAdjacentHTML('afterbegin', bar);
  if (state.offline) v.insertAdjacentHTML('beforeend', `<div class="banner">${ic('alert')} 网络不佳，当前显示的是本机缓存，刷新后自动重试。</div>`);
}

function renderAll() { renderSidebar(); renderView(); }

/* ---------- 今日待办 ---------- */
function taskRow(t, today) {
  const due = t.due;
  const overdue = !t.done && due && due < today;
  const dueCls = overdue ? 'overdue' : '';
  return `<div class="task-row ${t.done ? 'done' : ''}" data-id="${t.id}">
    <button class="checkbox ${t.done ? 'checked' : ''}" data-act="toggleTask" data-id="${t.id}" aria-label="完成">${ic('check', 'ic')}</button>
    <div class="t-text"><div class="tt">${esc(t.text)}</div>
      <div class="t-meta">
        ${t.priority ? `<span class="pill ${PRIO[t.priority] || 'p-low'}">${t.priority}</span>` : ''}
        ${due ? `<span class="link-tag ${dueCls}">${ic('clock')}截止 ${fmtMD(due)}${overdue ? ' 已逾期' : ''}</span>` : ''}
        ${t.link ? `<span class="link-tag">关联：${LINK_NAME[t.link] || t.link}</span>` : ''}
      </div>
    </div>
    <div class="row-actions">
      ${t.done ? '' : `<button class="btn sm ghost" data-act="taskToTopic" data-id="${t.id}">转选题</button>
      <button class="btn sm ghost" data-act="taskToPrompt" data-id="${t.id}">转提示词</button>`}
      <button class="icon-btn danger" data-act="delTask" data-id="${t.id}" aria-label="删除">${ic('trash')}</button>
    </div>
  </div>`;
}
function sortTasks(list) {
  const today = todayISO();
  return list.slice().sort((a, b) => {
    const ao = !a.done && a.due && a.due < today ? 0 : 1;
    const bo = !b.done && b.due && b.due < today ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (PRIO_ORD[a.priority] !== PRIO_ORD[b.priority]) return (PRIO_ORD[a.priority] ?? 9) - (PRIO_ORD[b.priority] ?? 9);
    return (a.due || '9999') < (b.due || '9999') ? -1 : 1;
  });
}
function viewTodo() {
  const items = state.db.tasks?.items || [];
  const today = todayISO();
  const pending = items.filter((t) => !t.done);
  const done = items.filter((t) => t.done);
  const todayDue = pending.filter((t) => t.due === today).length;
  const overdue = pending.filter((t) => t.due && t.due < today).length;
  const v = state.route.view;
  const tabs = tabsHTML('todo', [['focus', '今日焦点'], ['all', '全部任务'], ['done', '已完成']], v);
  let list, addForm = '', empty;
  if (v === 'done') {
    list = done.sort((a, b) => (a.created < b.created ? 1 : -1));
    empty = emptyHTML('listCheck', '还没有已完成的任务', '完成任务后它会出现在这里，作为你的产出记录。');
  } else if (v === 'focus') {
    list = sortTasks(pending.filter((t) => t.due && t.due <= today));
    empty = emptyHTML('check', '今天没有到期任务', '到期或逾期的任务会自动进入今日焦点。');
    addForm = 'x';
  } else {
    list = sortTasks(pending);
    empty = emptyHTML('plus', '还没有任务', '用上面的输入框添加第一件事。');
    addForm = 'x';
  }
  const quickAdd = addForm ? `
    <form class="quick-add" id="task-add">
      <input class="input grow" name="text" placeholder="要做什么？一句动作句最好" required>
      <select class="select" name="priority"><option>高</option><option selected>中</option><option>低</option></select>
      <input class="select" type="date" name="due" style="width:auto">
      <select class="select" name="link"><option value="">关联模块</option><option value="topics">选题中枢</option><option value="prompts">提示词库</option><option value="sites">网站收藏夹</option></select>
      <button class="btn primary" type="submit">${ic('plus')}新增任务</button>
    </form>` : '';
  return head('今日待办', `${new Date().getMonth() + 1}月${new Date().getDate()}日 ${WEEK[new Date().getDay()]}`, tabs) + `
    <div class="stat-row">
      <div class="stat"><div class="v num">${pending.length}</div><div class="k">未完成</div></div>
      <div class="stat"><div class="v num">${todayDue}</div><div class="k">今日到期</div></div>
      <div class="stat ${overdue ? 'warn' : 'dim'}"><div class="v num">${overdue}</div><div class="k">逾期</div></div>
      <div class="stat dim"><div class="v num">${done.length}</div><div class="k">已完成</div></div>
    </div>
    <div class="panel">${quickAdd}${v !== 'done' ? '' : ''}
      ${list.length ? list.map((t) => taskRow(t, today)).join('') : empty}
    </div>`;
}

/* ---------- 选题中枢 ---------- */
function topicCard(t) {
  const idx = state.db.topics.statuses.indexOf(t.status);
  const linked = (t.prompts || []).length;
  return `<div class="kcard" data-id="${t.id}">
    <div class="k-meta"><span class="pill ${PLAT_CLS[t.platform] || 'p-platform'}">${esc(t.platform)}</span>
      <span class="pill p-src">${esc(t.source)}</span>
      ${t.priority ? `<span class="pill ${PRIO[t.priority] || 'p-low'}">${t.priority}</span>` : ''}</div>
    <div class="k-title"><a href="#" data-act="editTopic" data-id="${t.id}" style="color:inherit">${esc(t.title)}</a></div>
    <div class="k-meta">
      ${t.eta ? `<span class="k-due">${ic('calendar')} 预估 ${fmtMD(t.eta)}</span>` : ''}
      ${linked ? `<span class="link-tag">${ic('sparkle')} 提示词 ${linked}</span>` : ''}
    </div>
    <div class="k-foot">
      <div class="k-move">
        <button class="icon-btn" data-act="moveTopic" data-id="${t.id}" data-dir="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="上一阶段">${ic('chevL')}</button>
        <button class="icon-btn" data-act="moveTopic" data-id="${t.id}" data-dir="1" ${idx >= state.db.topics.statuses.length - 1 ? 'disabled' : ''} aria-label="下一阶段">${ic('chevR')}</button>
      </div>
      <button class="icon-btn danger" data-act="delTopic" data-id="${t.id}" aria-label="删除">${ic('trash')}</button>
    </div>
  </div>`;
}
function kanbanHTML(list) {
  const st = state.db.topics.statuses;
  return `<div class="kanban">${st.map((s) => {
    const cards = list.filter((t) => t.status === s);
    return `<div class="kcol"><div class="kcol-head"><span class="t">${s}</span><span class="c num">${cards.length}</span></div>
      <div class="kcards">${cards.map(topicCard).join('') || `<div style="text-align:center;color:var(--text-3);font-size:12px;padding:14px 0">暂无</div>`}</div></div>`;
  }).join('')}</div>`;
}
function viewTopics() {
  const d = state.db.topics;
  const v = state.route.view;
  const tabs = tabsHTML('topics', [['board', '热榜看板'], ['renew', '旧选题翻新'], ['published', '已发布数据'], ['calendar', '日历排期']], v);
  const counts = {};
  d.statuses.forEach((s) => counts[s] = d.items.filter((t) => t.status === s).length);
  let body = '';
  if (v === 'board') {
    const signals = (d.signals || []).slice().sort((a, b) => (a.created < b.created ? 1 : -1));
    body = `
    <div class="panel">
      <form class="quick-add" id="signal-add">
        <select class="select" name="platform" style="flex:none"><option>抖音</option><option selected>小红书</option><option>公众号</option></select>
        <input class="input grow" name="text" placeholder="记一条平台信号，比如某话题热度上升" required>
        <button class="btn soft" type="submit">${ic('plus')}记信号</button>
      </form>
      ${signals.length ? signals.map((s) => `
        <div class="signal-item ${s.handled ? 'handled' : ''}">
          <span class="s-text">${esc(s.text)}</span>
          <span style="font-size:11.5px;color:var(--text-3);flex:none">${relTime(s.created)}</span>
          <div class="row-actions">
            ${s.handled ? '' : `<button class="btn sm ghost" data-act="signalToTopic" data-id="${s.id}">转选题</button>`}
            <button class="icon-btn" data-act="toggleSignal" data-id="${s.id}" aria-label="标记已处理">${ic(s.handled ? 'refresh' : 'check')}</button>
            <button class="icon-btn danger" data-act="delSignal" data-id="${s.id}" aria-label="删除">${ic('trash')}</button>
          </div>
        </div>`).join('') : ''}
    </div>
    <div class="section-gap"><h2 class="section-title">选题看板 <span class="cnt num">${d.items.length}</span></h2>
    ${kanbanHTML(d.items)}</div>`;
  } else if (v === 'renew') {
    const list = d.items.filter((t) => t.source === '旧选题');
    body = `<div class="banner">${ic('bulb')} 这里汇集来源为「旧选题」的内容，适合翻新重做或二次剪辑。</div>${kanbanHTML(list)}`;
  } else if (v === 'published') {
    const list = d.items.filter((t) => t.status === '已发布' || t.status === '已复盘').sort((a, b) => (a.eta < b.eta ? 1 : -1));
    body = `<div class="panel table-wrap"><table class="data"><thead><tr>
      <th>平台</th><th>标题</th><th>发布日</th><th>阅读/播放</th><th>点击率</th><th>收藏/互动</th><th>复盘结论</th><th></th>
    </tr></thead><tbody>
      ${list.map((t) => `<tr>
        <td><span class="pill ${PLAT_CLS[t.platform] || 'p-platform'}">${esc(t.platform)}</span></td>
        <td style="max-width:280px">${esc(t.title)}</td>
        <td class="num-cell">${t.eta ? fmtMD(t.eta) : '-'}</td>
        <td class="num-cell">${esc(t.views || '-')}</td>
        <td class="num-cell">${esc(t.ctr || '-')}</td>
        <td class="num-cell">${esc(t.saves || '-')}</td>
        <td style="color:var(--text-2)">${esc(t.review || '-')}</td>
        <td><div class="row-actions" style="opacity:1">
          ${t.url ? `<a class="icon-btn" href="${esc(t.url)}" target="_blank" rel="noopener" aria-label="打开">${ic('external')}</a>` : ''}
          <button class="icon-btn" data-act="editStats" data-id="${t.id}" aria-label="编辑数据">${ic('edit')}</button>
        </div></td>
      </tr>`).join('') || `<tr><td colspan="8">${emptyHTML('board', '还没有已发布的选题', '在看板里推进到「已发布」后，这里可以回填数据。')}</td></tr>`}
    </tbody></table></div>`;
  } else {
    body = calendarHTML();
  }
  return head('选题中枢', '从热榜信号到复盘数据的完整流水线', tabs + ` <button class="btn primary" data-act="addTopic">${ic('plus')}新建选题</button>`) + `
    <div class="stat-row">
      <div class="stat"><div class="v num">${counts['待评估'] || 0}</div><div class="k">待评估</div></div>
      <div class="stat dim"><div class="v num">${counts['制作中'] || 0}</div><div class="k">制作中</div></div>
      <div class="stat dim"><div class="v num">${counts['待发布'] || 0}</div><div class="k">待发布</div></div>
      <div class="stat dim"><div class="v num">${(counts['已发布'] || 0) + (counts['已复盘'] || 0)}</div><div class="k">已发布</div></div>
    </div>${body}`;
}
function calendarHTML() {
  const { y, m } = state.cal;
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const start = new Date(y, m, 1 - startDow);
  const today = todayISO();
  const byDate = {};
  (state.db.topics?.items || []).forEach((t) => { if (t.eta) (byDate[t.eta] = byDate[t.eta] || []).push(t); });
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dim = d.getMonth() !== m ? 'dim' : '';
    const evs = (byDate[iso] || []).map((t) =>
      `<button class="cal-ev ${PLAT_CLS2[t.platform] || ''}" data-act="editTopic" data-id="${t.id}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('');
    cells += `<div class="cal-day ${dim} ${iso === today ? 'today' : ''}"><span class="d num">${d.getDate()}</span>${evs}</div>`;
  }
  return `<div class="cal">
    <div class="cal-head">
      <div class="m">${y} 年 ${m + 1} 月</div>
      <div style="display:flex;gap:2px">
        <button class="icon-btn" data-act="calPrev" aria-label="上个月">${ic('chevL')}</button>
        <button class="icon-btn" data-act="calNext" aria-label="下个月">${ic('chevR')}</button>
      </div>
    </div>
    <div class="cal-grid">
      ${['日', '一', '二', '三', '四', '五', '六'].map((w) => `<div class="cal-dow">${w}</div>`).join('')}
      ${cells}
    </div></div>`;
}
function topicModal(t) {
  const d = state.db.topics;
  const sel = (name, opts, cur) => `<select class="select" name="${name}" style="width:100%">${opts.map((o) =>
    `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  openModal({
    title: t ? '编辑选题' : '新建选题',
    body: `<form id="topic-form"><div class="form-grid">
      <div class="field full"><label>选题标题</label><input class="input" name="title" value="${esc(t?.title || '')}" required placeholder="一句能直接开工的选题"></div>
      <div class="field"><label>平台</label>${sel('platform', ['公众号', '小红书', '抖音'], t?.platform || '小红书')}</div>
      <div class="field"><label>来源</label>${sel('source', ['热榜', '旧选题', '评论区', '对标拆解', '灵感'], t?.source || '灵感')}</div>
      <div class="field"><label>状态</label>${sel('status', d.statuses, t?.status || '待评估')}</div>
      <div class="field"><label>优先级</label>${sel('priority', ['高', '中', '低'], t?.priority || '中')}</div>
      <div class="field"><label>预估发布日</label><input class="input" type="date" name="eta" value="${esc(t?.eta || '')}"></div>
      <div class="field"><label>发布链接</label><input class="input" name="url" value="${esc(t?.url || '')}" placeholder="发布后回填"></div>
    </div></form>`,
    foot: `${t ? `<button class="btn danger-ghost" data-act="delTopic" data-id="${t.id}" style="margin-right:auto">${ic('trash')}删除</button>` : ''}
      <button class="btn ghost" data-act="closeModal">取消</button>
      <button class="btn primary" type="submit" form="topic-form">保存</button>`,
  });
  $('#topic-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const obj = {
      title: f.title.trim(), platform: f.platform, source: f.source, status: f.status,
      priority: f.priority, eta: f.eta || null, url: f.url.trim(),
    };
    if (t) { Object.assign(state.db.topics.items.find((x) => x.id === t.id), obj); }
    else { state.db.topics.items.push({ id: uid(), prompts: [], review: '', created: new Date().toISOString(), ...obj }); }
    closeModal(); scheduleSave('topics'); renderAll();
    toast(t ? '选题已更新' : '选题已新建');
  });
}
function statsModal(t) {
  openModal({
    title: '发布数据：' + (t.title.length > 16 ? t.title.slice(0, 16) + '…' : t.title),
    body: `<form id="stats-form"><div class="form-grid">
      <div class="field"><label>阅读 / 播放</label><input class="input" name="views" value="${esc(t.views || '')}" placeholder="如 1.2w"></div>
      <div class="field"><label>点击率 / 完播</label><input class="input" name="ctr" value="${esc(t.ctr || '')}" placeholder="如 5.2%"></div>
      <div class="field"><label>收藏 / 互动</label><input class="input" name="saves" value="${esc(t.saves || '')}" placeholder="如 收藏 900"></div>
      <div class="field"><label>复盘结论（一句话）</label><input class="input" name="review" value="${esc(t.review || '')}" placeholder="如 标题可复用"></div>
    </div></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" type="submit" form="stats-form">保存</button>`,
  });
  $('#stats-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    Object.assign(state.db.topics.items.find((x) => x.id === t.id), f);
    closeModal(); scheduleSave('topics'); renderAll(); toast('数据已回填');
  });
}

/* ---------- 提示词库 ---------- */
function promptCard(p) {
  const meta = [];
  if (p.type === '文生图') { if (p.model) meta.push('模型 ' + p.model); if (p.vars?.length) meta.push('变量 ' + p.vars.join('、')); }
  else { if (p.lens) meta.push('镜头 ' + p.lens); if (p.duration) meta.push('时长 ' + p.duration); }
  return `<div class="panel prompt-card" data-id="${p.id}">
    <div class="p-head">
      <span class="pill p-type">${esc(p.type)}</span>
      <span class="p-title">${esc(p.title)}</span>
      <button class="icon-btn star ${p.favorite ? 'on' : ''}" data-act="toggleFav" data-id="${p.id}" aria-label="收藏" style="${p.favorite ? 'color:var(--warn)' : ''}">${ic('star')}</button>
    </div>
    <pre class="p-body">${esc(p.body || '')}</pre>
    <div class="p-meta">${(p.tags || []).map((tg) => `<span class="pill p-src">${esc(tg)}</span>`).join('')}
      ${meta.map((m) => `<span class="link-tag">${esc(m)}</span>`).join('')}</div>
    <div class="p-foot">
      <button class="btn sm soft" data-act="copyPrompt" data-id="${p.id}">${ic('copy')}复制</button>
      <button class="btn sm ghost" data-act="linkPrompt" data-id="${p.id}">关联选题</button>
      <span class="spacer"></span>
      <button class="icon-btn" data-act="editPrompt" data-id="${p.id}" aria-label="编辑">${ic('edit')}</button>
      <button class="icon-btn danger" data-act="delPrompt" data-id="${p.id}" aria-label="删除">${ic('trash')}</button>
    </div>
  </div>`;
}
function viewPrompts() {
  const items = state.db.prompts?.items || [];
  const v = state.promptFilter;
  const tabs = tabsHTML('prompts', [['all', '全部'], ['文生图', '文生图'], ['Seedance', 'Seedance 2.5'], ['fav', '收藏']], v);
  let list = items;
  if (v === 'fav') list = items.filter((p) => p.favorite);
  else if (v !== 'all') list = items.filter((p) => p.type === v);
  if (state.promptSearch) {
    const q = state.promptSearch.toLowerCase();
    list = list.filter((p) => (p.title + (p.body || '') + (p.tags || []).join('')).toLowerCase().includes(q));
  }
  list = list.slice().sort((a, b) => (a.created < b.created ? 1 : -1));
  const nT = items.filter((p) => p.type === '文生图').length;
  const nS = items.filter((p) => p.type === 'Seedance').length;
  return head('提示词库', '文生图与 Seedance 2.5 的弹药库', tabs + `
    <input class="input" id="prompt-search" placeholder="搜索标题、正文、标签" value="${esc(state.promptSearch)}" style="width:180px">
    <button class="btn primary" data-act="addPromptModal">${ic('plus')}新建提示词</button>`) + `
    <div class="stat-row">
      <div class="stat"><div class="v num">${nT}</div><div class="k">文生图</div></div>
      <div class="stat"><div class="v num">${nS}</div><div class="k">Seedance</div></div>
      <div class="stat dim"><div class="v num">${items.filter((p) => p.favorite).length}</div><div class="k">已收藏</div></div>
    </div>
    ${list.length ? `<div class="prompt-grid">${list.map(promptCard).join('')}</div>`
      : `<div class="panel">${emptyHTML('sparkle', '这里还没有提示词', '点击右上角「新建提示词」，把好用的提示词沉淀下来。')}</div>`}`;
}
function promptModal(p) {
  const type = p?.type || '文生图';
  openModal({
    title: p ? '编辑提示词' : '新建提示词',
    body: `<form id="prompt-form"><div class="form-grid">
      <div class="field"><label>类型</label><select class="select" name="type" style="width:100%"><option ${type === '文生图' ? 'selected' : ''}>文生图</option><option ${type === 'Seedance' ? 'selected' : ''}>Seedance</option></select></div>
      <div class="field"><label>标题</label><input class="input" name="title" value="${esc(p?.title || '')}" required></div>
      <div class="field full"><label>正文</label><textarea class="textarea" name="body" rows="5" placeholder="完整的提示词内容">${esc(p?.body || '')}</textarea></div>
      <div class="field full"><label>标签</label><input class="input" name="tags" value="${esc((p?.tags || []).join('、'))}" placeholder="用顿号或逗号分隔"></div>
      <div class="field"><label>模型（文生图）</label><input class="input" name="model" value="${esc(p?.model || '')}" placeholder="Midjourney / SD"></div>
      <div class="field"><label>变量（文生图）</label><input class="input" name="vars" value="${esc((p?.vars || []).join('、'))}" placeholder="{城市}、{天气}"></div>
      <div class="field"><label>镜头运动（Seedance）</label><input class="input" name="lens" value="${esc(p?.lens || '')}" placeholder="中近景，慢推"></div>
      <div class="field"><label>时长（Seedance）</label><input class="input" name="duration" value="${esc(p?.duration || '')}" placeholder="5s"></div>
      <div class="field"><label>参考图 / 视频（Seedance）</label><input class="input" name="ref" value="${esc(p?.ref || '')}"></div>
      <div class="field"><label>成功记录（Seedance）</label><input class="input" name="log" value="${esc(p?.log || '')}" placeholder="第几次、怎么调成功的"></div>
      <div class="field full"><label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" name="favorite" ${p?.favorite ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent)"> 收藏这条提示词</label></div>
    </div></form>`,
    foot: `${p ? `<button class="btn danger-ghost" data-act="delPrompt" data-id="${p.id}" style="margin-right:auto">${ic('trash')}删除</button>` : ''}
      <button class="btn ghost" data-act="closeModal">取消</button>
      <button class="btn primary" type="submit" form="prompt-form">保存</button>`,
  });
  $('#prompt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const split = (s) => (s || '').split(/[、,，]/).map((x) => x.trim()).filter(Boolean);
    const obj = {
      type: f.type, title: f.title.trim(), body: f.body, tags: split(f.tags),
      favorite: !!f.favorite, model: f.model || '', vars: split(f.vars),
      lens: f.lens || '', duration: f.duration || '', ref: f.ref || '', log: f.log || '',
    };
    if (p) Object.assign(state.db.prompts.items.find((x) => x.id === p.id), obj);
    else state.db.prompts.items.push({ id: uid(), created: new Date().toISOString(), ...obj });
    closeModal(); scheduleSave('prompts'); renderAll(); toast(p ? '提示词已更新' : '提示词已入库');
  });
}
function linkModal(p) {
  const topics = state.db.topics?.items || [];
  const linked = new Set(topics.filter((t) => (t.prompts || []).includes(p.id)).map((t) => t.id));
  openModal({
    title: '关联选题：' + (p.title.length > 14 ? p.title.slice(0, 14) + '…' : p.title),
    body: topics.length ? topics.map((t) => `
      <label style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" name="linktp" value="${t.id}" ${linked.has(t.id) ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent)">
        <span class="pill ${PLAT_CLS[t.platform] || 'p-platform'}" style="flex:none">${esc(t.platform)}</span>
        <span style="flex:1">${esc(t.title)}</span>
        <span style="font-size:11.5px;color:var(--text-3)">${esc(t.status)}</span>
      </label>`).join('')
      : emptyHTML('board', '还没有选题', '先到选题中枢新建一个选题再来关联。'),
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" id="link-save">保存关联</button>`,
  });
  $('#link-save').addEventListener('click', () => {
    const checked = new Set($$('#modal-root input[name="linktp"]:checked').map((i) => i.value));
    topics.forEach((t) => {
      const arr = new Set(t.prompts || []);
      if (checked.has(t.id)) arr.add(p.id); else arr.delete(p.id);
      t.prompts = [...arr];
    });
    closeModal(); scheduleSave('topics'); renderAll(); toast('关联已更新');
  });
}

/* ---------- 网站收藏夹 ---------- */
const TILE_HUES = [212, 154, 16, 262, 340, 44, 190];
function siteCard(s) {
  let h = 0; for (const ch of s.name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const hue = TILE_HUES[h % TILE_HUES.length];
  let host = s.url; try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch (e) {}
  return `<div class="panel site-card" data-id="${s.id}">
    <div class="letter" style="background:hsl(${hue} 42% 46%)">${esc(s.name.slice(0, 1).toUpperCase())}</div>
    <div class="s-info">
      <div class="s-name">${esc(s.name)}</div>
      <div class="s-host">${esc(host)}</div>
      ${s.note ? `<div class="s-note">${esc(s.note)}</div>` : ''}
    </div>
    <div class="row-actions" style="opacity:1">
      <a class="icon-btn" href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="打开">${ic('external')}</a>
      <button class="icon-btn" data-act="editSite" data-id="${s.id}" aria-label="编辑">${ic('edit')}</button>
      <button class="icon-btn danger" data-act="delSite" data-id="${s.id}" aria-label="删除">${ic('trash')}</button>
    </div>
  </div>`;
}
function viewSites() {
  const d = state.db.sites;
  const groups = d.groups || [];
  const v = state.siteFilter;
  const tabs = tabsHTML('sites', [['all', '全部'], ...groups.map((g) => [g, g])], v);
  const shown = v === 'all' ? groups : groups.filter((g) => g === v);
  const list = v === 'all' ? d.items : d.items.filter((s) => s.group === v);
  return head('网站收藏夹', `${groups.length} 个分组，${d.items.length} 个网站`, tabs + `
    <button class="btn primary" data-act="addSiteModal">${ic('plus')}添加网站</button>`) + `
    ${list.length ? shown.map((g) => {
      const items = d.items.filter((s) => s.group === g);
      if (!items.length) return '';
      return `<div class="group-block"><h2 class="section-title">${esc(g)} <span class="cnt num">${items.length}</span></h2>
        <div class="site-grid">${items.map(siteCard).join('')}</div></div>`;
    }).join('') : `<div class="panel">${emptyHTML('globe', '还没有收藏的网站', '点击右上角「添加网站」，把常用的 AI 工具和素材站集中管理。')}</div>`}`;
}
function siteModal(s) {
  const groups = state.db.sites.groups || [];
  openModal({
    title: s ? '编辑网站' : '添加网站',
    body: `<form id="site-form"><div class="form-grid">
      <div class="field"><label>网站名</label><input class="input" name="name" value="${esc(s?.name || '')}" required></div>
      <div class="field"><label>分组</label><input class="input" name="group" list="group-list" value="${esc(s?.group || groups[0] || '')}" required>
        <datalist id="group-list">${groups.map((g) => `<option value="${esc(g)}">`).join('')}</datalist>
        <span class="hint">可以输入新分组名，保存后自动创建</span></div>
      <div class="field full"><label>URL</label><input class="input" name="url" value="${esc(s?.url || '')}" placeholder="https://" required></div>
      <div class="field full"><label>备注</label><input class="input" name="note" value="${esc(s?.note || '')}" placeholder="可选"></div>
    </div></form>`,
    foot: `${s ? `<button class="btn danger-ghost" data-act="delSite" data-id="${s.id}" style="margin-right:auto">${ic('trash')}删除</button>` : ''}
      <button class="btn ghost" data-act="closeModal">取消</button>
      <button class="btn primary" type="submit" form="site-form">保存</button>`,
  });
  $('#site-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    let url = f.url.trim(); if (url && !/^https?:\/\//.test(url)) url = 'https://' + url;
    const obj = { name: f.name.trim(), url, group: f.group.trim() || '未分组', note: f.note.trim() };
    if (!state.db.sites.groups.includes(obj.group)) state.db.sites.groups.push(obj.group);
    if (s) Object.assign(state.db.sites.items.find((x) => x.id === s.id), obj);
    else state.db.sites.items.push({ id: uid(), created: new Date().toISOString(), ...obj });
    closeModal(); scheduleSave('sites'); renderAll(); toast(s ? '网站已更新' : '网站已收藏');
  });
}

/* ---------- 灵感速记 ---------- */
function ideaRow(i) {
  return `<div class="idea-item ${i.processed ? 'done' : ''}" data-id="${i.id}">
    <div style="flex:1;min-width:0">
      <div class="i-text">${esc(i.text)}</div>
      <div class="i-time">${relTime(i.created)}</div>
    </div>
    <div class="row-actions">
      ${i.processed ? '' : `<button class="btn sm ghost" data-act="ideaToTask" data-id="${i.id}">转待办</button>
      <button class="btn sm ghost" data-act="ideaToTopic" data-id="${i.id}">转选题</button>
      <button class="btn sm ghost" data-act="ideaToPrompt" data-id="${i.id}">转提示词</button>`}
      <button class="icon-btn" data-act="toggleIdea" data-id="${i.id}" aria-label="标记已处理">${ic(i.processed ? 'refresh' : 'check')}</button>
      <button class="icon-btn danger" data-act="delIdea" data-id="${i.id}" aria-label="删除">${ic('trash')}</button>
    </div>
  </div>`;
}
function viewIdeas() {
  const items = (state.db.ideas?.items || []).slice().sort((a, b) => (a.created < b.created ? 1 : -1));
  const open = items.filter((i) => !i.processed);
  const v = state.ideaFilter;
  const tabs = tabsHTML('ideas', [['open', '待处理'], ['all', '全部']], v);
  const list = v === 'open' ? open : items;
  return head('灵感速记', '想到什么记什么，再顺手转成任务或选题', tabs) + `
    <div class="stat-row">
      <div class="stat"><div class="v num">${open.length}</div><div class="k">待处理</div></div>
      <div class="stat dim"><div class="v num">${items.length - open.length}</div><div class="k">已处理</div></div>
    </div>
    <div class="panel idea-box">
      <form id="idea-add" style="display:flex;gap:8px;align-items:flex-start">
        <textarea class="textarea grow" name="text" rows="2" placeholder="快速记一句…" style="flex:1"></textarea>
        <button class="btn primary" type="submit">${ic('plus')}记下来</button>
      </form>
    </div>
    <div class="panel section-gap">
      ${list.length ? list.map(ideaRow).join('') : emptyHTML('bulb', '没有待处理的灵感', '上面的输入框想到就记，之后再转成任务、选题或提示词。')}
    </div>`;
}

/* ---------- 动作 ---------- */
function newTask(text, priority, due, link) {
  state.db.tasks.items.push({ id: uid(), text, priority, due: due || null, done: false, link: link || null, created: new Date().toISOString() });
  scheduleSave('tasks'); renderAll();
}
function newTopic(obj) {
  state.db.topics.items.push({ id: uid(), prompts: [], url: '', review: '', created: new Date().toISOString(), eta: null, priority: '中', ...obj });
  scheduleSave('topics'); renderAll();
}
function newPrompt(obj) {
  state.db.prompts.items.push({ id: uid(), tags: [], body: '', created: new Date().toISOString(), ...obj });
  scheduleSave('prompts'); renderAll();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('已复制到剪贴板'); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板'); } catch (e2) { toast('复制失败，请手动选择', 'err'); }
    ta.remove();
  }
}
const ACTIONS = {
  nav: (id, el) => { state.route = { mod: el.dataset.mod, view: el.dataset.mod === 'todo' ? 'focus' : el.dataset.mod === 'topics' ? 'board' : 'main' }; if (el.dataset.mod === 'prompts') state.route.view = 'all'; location.hash = '#/' + el.dataset.mod; closeSide(); renderAll(); window.scrollTo(0, 0); },
  tab: (id, el) => {
    const { mod, view } = el.dataset;
    if (mod === 'prompts') state.promptFilter = view;
    else if (mod === 'sites') state.siteFilter = view;
    else if (mod === 'ideas') state.ideaFilter = view;
    else state.route.view = view;
    renderView(); renderSidebar();
  },
  toggleTheme: () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); renderSidebar(); },
  openSide: () => { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; },
  closeModal: () => closeModal(),
  scrim: (id, el, e) => { if (e.target === el) closeModal(); },
  openSettings: () => settingsModal(),
  syncReload: async () => { await loadAll(); renderAll(); toast(state.offline ? '已加载本机缓存' : '数据已刷新'); },
  /* 待办 */
  toggleTask: (id) => { const t = state.db.tasks.items.find((x) => x.id === id); t.done = !t.done; scheduleSave('tasks'); renderAll(); },
  delTask: (id) => confirmDlg('删除这条任务？', () => { state.db.tasks.items = state.db.tasks.items.filter((x) => x.id !== id); scheduleSave('tasks'); renderAll(); toast('任务已删除'); }),
  taskToTopic: (id) => { const t = state.db.tasks.items.find((x) => x.id === id); newTopic({ title: t.text, platform: '小红书', source: '灵感', status: '待评估' }); toast('已转到选题中枢（待评估）'); },
  taskToPrompt: (id) => { const t = state.db.tasks.items.find((x) => x.id === id); newPrompt({ type: '文生图', title: t.text }); toast('已在提示词库创建草稿'); },
  /* 选题 */
  addTopic: () => topicModal(null),
  editTopic: (id) => topicModal(state.db.topics.items.find((x) => x.id === id)),
  moveTopic: (id, el) => {
    const t = state.db.topics.items.find((x) => x.id === id);
    const st = state.db.topics.statuses;
    const i = st.indexOf(t.status) + (+el.dataset.dir);
    if (i >= 0 && i < st.length) { t.status = st[i]; scheduleSave('topics'); renderAll(); }
  },
  delTopic: (id) => confirmDlg('删除这个选题？', () => { state.db.topics.items = state.db.topics.items.filter((x) => x.id !== id); scheduleSave('topics'); renderAll(); toast('选题已删除'); }),
  editStats: (id) => statsModal(state.db.topics.items.find((x) => x.id === id)),
  addSignal: () => {},
  toggleSignal: (id) => { const s = state.db.topics.signals.find((x) => x.id === id); s.handled = !s.handled; scheduleSave('topics'); renderAll(); },
  delSignal: (id) => { state.db.topics.signals = state.db.topics.signals.filter((x) => x.id !== id); scheduleSave('topics'); renderAll(); },
  signalToTopic: (id) => { const s = state.db.topics.signals.find((x) => x.id === id); s.handled = true; newTopic({ title: s.text.split('：').slice(1).join('：') || s.text, platform: '小红书', source: '热榜', status: '待评估' }); toast('信号已转为选题'); },
  calPrev: () => { const c = state.cal; c.m--; if (c.m < 0) { c.m = 11; c.y--; } renderView(); },
  calNext: () => { const c = state.cal; c.m++; if (c.m > 11) { c.m = 0; c.y++; } renderView(); },
  /* 提示词 */
  addPromptModal: () => promptModal(null),
  editPrompt: (id) => promptModal(state.db.prompts.items.find((x) => x.id === id)),
  toggleFav: (id) => { const p = state.db.prompts.items.find((x) => x.id === id); p.favorite = !p.favorite; scheduleSave('prompts'); renderAll(); },
  delPrompt: (id) => confirmDlg('删除这条提示词？', () => { state.db.prompts.items = state.db.prompts.items.filter((x) => x.id !== id); scheduleSave('prompts'); renderAll(); toast('提示词已删除'); }),
  copyPrompt: (id) => { const p = state.db.prompts.items.find((x) => x.id === id); copyText(p.body || p.title); },
  linkPrompt: (id) => linkModal(state.db.prompts.items.find((x) => x.id === id)),
  /* 网站 */
  addSiteModal: () => siteModal(null),
  editSite: (id) => siteModal(state.db.sites.items.find((x) => x.id === id)),
  delSite: (id) => confirmDlg('删除这个网站？', () => { state.db.sites.items = state.db.sites.items.filter((x) => x.id !== id); scheduleSave('sites'); renderAll(); toast('已删除'); }),
  /* 灵感 */
  toggleIdea: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = !i.processed; scheduleSave('ideas'); renderAll(); },
  delIdea: (id) => { state.db.ideas.items = state.db.ideas.items.filter((x) => x.id !== id); scheduleSave('ideas'); renderAll(); },
  ideaToTask: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = true; newTask(i.text, '中', null, null); scheduleSave('ideas'); renderAll(); toast('已转为待办'); },
  ideaToTopic: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = true; scheduleSave('ideas'); newTopic({ title: i.text, platform: '小红书', source: '灵感', status: '待评估' }); toast('已转为选题（待评估）'); },
  ideaToPrompt: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = true; scheduleSave('ideas'); newPrompt({ type: '文生图', title: i.text }); toast('已在提示词库创建草稿'); },
};
function closeSide() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }

/* ---------- 设置 ---------- */
function settingsModal() {
  const cfg = repoCfg();
  openModal({
    title: '设置',
    body: `<form id="settings-form"><div class="form-grid">
      <div class="field full"><label>GitHub 令牌（Token）</label>
        <input class="input" name="token" type="password" value="${esc(state.token)}" placeholder="ghp_ 或 github_pat_ 开头" autocomplete="off">
        <span class="hint">仅保存在本机浏览器 localStorage，用于在页面上直接增删改并提交到仓库。建议使用只授予本仓库 Contents 读写权限的 fine-grained token，不放进任何代码。</span></div>
      <div class="field"><label>仓库 Owner</label><input class="input" name="owner" value="${esc(cfg.owner)}"></div>
      <div class="field"><label>仓库名</label><input class="input" name="repo" value="${esc(cfg.repo)}"></div>
    </div></form>`,
    foot: `<button class="btn danger-ghost" id="st-clear" style="margin-right:auto">清除令牌</button>
      <button class="btn ghost" id="st-test">测试连接</button>
      <button class="btn primary" type="submit" form="settings-form">保存</button>`,
  });
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    state.token = f.token.trim();
    state.token ? localStorage.setItem('wb_token', state.token) : localStorage.removeItem('wb_token');
    localStorage.setItem('wb_repo', JSON.stringify({ owner: f.owner.trim(), repo: f.repo.trim() }));
    state.shas = {}; closeModal(); renderAll(); toast('设置已保存');
  });
  $('#st-test').addEventListener('click', async () => {
    const f = Object.fromEntries(new FormData($('#settings-form')).entries());
    try {
      const j = await gh(`/repos/${f.owner.trim()}/${f.repo.trim()}`);
      toast(`连接成功：${j.full_name}（${j.private ? '私有' : '公开'}）`);
    } catch (e) { toast('连接失败：' + e.status + ' ' + e.message, 'err'); }
  });
  $('#st-clear').addEventListener('click', () => {
    state.token = ''; localStorage.removeItem('wb_token');
    state.sync = 'local'; closeModal(); renderAll(); toast('已清除本机令牌');
  });
}

/* ---------- 事件绑定 ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) { return; }
  const act = el.dataset.act;
  if (act === 'scrim') { if (e.target === el) closeModal(); return; }
  if (act === 'nav') { ACTIONS.nav(null, el, e); return; }
  if (ACTIONS[act]) { if (act === 'editTopic') e.preventDefault(); ACTIONS[act](el.dataset.id, el, e); }
});
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.id === 'task-add') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    if (!d.text.trim()) return;
    newTask(d.text.trim(), d.priority, d.due || null, d.link || null);
    toast('任务已添加');
  } else if (f.id === 'signal-add') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    if (!d.text.trim()) return;
    state.db.topics.signals.push({ id: uid(), text: `${d.platform}：${d.text.trim()}`, handled: false, created: new Date().toISOString() });
    scheduleSave('topics'); renderAll(); toast('信号已记录');
  } else if (f.id === 'idea-add') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    if (!d.text.trim()) return;
    state.db.ideas.items.push({ id: uid(), text: d.text.trim(), processed: false, created: new Date().toISOString() });
    scheduleSave('ideas'); renderAll(); toast('已记下来');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModal(); closeSide(); }
  const ideaBox = $('#idea-add textarea');
  if (ideaBox && document.activeElement === ideaBox && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); $('#idea-add').requestSubmit();
  }
  const taskText = $('#task-add input[name="text"]');
  if (taskText && document.activeElement === taskText && e.key === 'Enter') {
    e.preventDefault(); $('#task-add').requestSubmit();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'prompt-search') {
    state.promptSearch = e.target.value;
    const grid = $('.prompt-grid');
    renderView();
    const ns = $('#prompt-search'); if (ns) { ns.focus(); ns.setSelectionRange(ns.value.length, ns.value.length); }
  }
});
$('#scrim').addEventListener('click', closeSide);
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#\/(\w+)(?:\/(\w+))?/);
  if (m) { state.route = { mod: m[1], view: m[2] || (m[1] === 'todo' ? 'focus' : m[1] === 'topics' ? 'board' : 'main') }; renderAll(); }
});

/* ---------- 启动 ---------- */
(async function init() {
  renderAll();
  await loadAll();
  const m = location.hash.match(/^#\/(\w+)(?:\/(\w+))?/);
  if (m) state.route = { mod: m[1], view: m[2] || (m[1] === 'todo' ? 'focus' : m[1] === 'topics' ? 'board' : 'main') };
  renderAll();
})();
