/* ============================================================
   个人工作台 app.js
   零依赖单页应用。方案 B：云端数据存于 Cloudflare Worker + D1，
   浏览器只在 localStorage 保存登录令牌、离线缓存和待同步队列。
   ============================================================ */
'use strict';

/* ---------- 小工具 ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
const LINK_NAME = { topics: '选题中枢', prompts: '提示词库', sites: '网站收藏' };

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
  eye: '<path d="M3.2 10c1.9-3.1 4.1-4.6 6.8-4.6s4.9 1.5 6.8 4.6c-1.9 3.1-4.1 4.6-6.8 4.6S5.1 13.1 3.2 10z"/><circle cx="10" cy="10" r="2.3"/>',
  eyeOff: '<path d="M3.2 10c1.9-3.1 4.1-4.6 6.8-4.6 1.2 0 2.3.3 3.4.8M16.8 10c-.7 1.2-1.5 2.2-2.4 3M12.9 14.2c-.9.3-1.9.4-2.9.4-2.7 0-4.9-1.5-6.8-4.6.5-.8 1-1.5 1.6-2.1"/><line x1="4.2" y1="16" x2="15.8" y2="4.4"/>',
  image: '<rect x="3" y="4.5" width="14" height="11" rx="2"/><circle cx="7.2" cy="8.3" r="1.3"/><path d="M3.5 13.6l3.4-3 3 2.6 3.6-3.6 3 2.6"/>',
  palette: '<path d="M10 17.8a8 8 0 1 1 8-7.2 4 4 0 0 1-4 4h-1.8a1.4 1.4 0 0 0-1.1 2.2l.2.3a1.4 1.4 0 0 1-1.1 2.2z"/><circle cx="11.2" cy="5.4" r=".5" fill="currentColor"/><circle cx="14.5" cy="8.6" r=".5" fill="currentColor"/><circle cx="5.4" cy="10.2" r=".5" fill="currentColor"/><circle cx="7" cy="6.2" r=".5" fill="currentColor"/>',
};
const ic = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

/* ---------- 全局状态 ---------- */
const API_KEYS = ['tasks', 'topics', 'prompts', 'sites', 'ideas'];
const DEFAULT_API_BASE = 'https://nickwork-api.nickjob1204.workers.dev';
const state = {
  db: {}, loaded: false, offline: false,
  sync: 'init', lastErr: '',
  apiBase: localStorage.getItem('wb_api_base') || DEFAULT_API_BASE,
  apiToken: sessionStorage.getItem('wb_api_token') || '',
  feishuUrl: localStorage.getItem('wb_feishu_url') || '',
  galleryRepo: localStorage.getItem('wb_gallery_repo') || 'Nick-Job/boomb',
  galleryBranch: localStorage.getItem('wb_gallery_branch') || 'main',
  galleryRoot: localStorage.getItem('wb_gallery_root') || 'images',
  galleryFolder: localStorage.getItem('wb_gallery_folder') || 'uploads',
  galleryToken: localStorage.getItem('wb_gallery_token') || sessionStorage.getItem('wb_gallery_token') || '',
  galleryUploading: false, galleryProgress: '',
  dirty: new Set((() => {
    try { return JSON.parse(localStorage.getItem('wb_dirty') || '[]').filter((k) => API_KEYS.includes(k)); }
    catch (e) { return []; }
  })()),
  route: { mod: 'todo', view: 'all' },
  promptFilter: 'all', promptSearch: '',
  siteFilter: 'all',
  ideaFilter: 'open',
  cal: (() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; })(),
  showHidden: false,
};
function galleryCfg() {
  const parts = String(state.galleryRepo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').split('/').filter(Boolean);
  return {
    owner: parts[0] || '',
    repo: parts[1] || '',
    branch: String(state.galleryBranch || 'main').trim() || 'main',
    root: String(state.galleryRoot || 'images').replace(/^\/+|\/+$/g, ''),
    folder: String(state.galleryFolder || 'uploads').replace(/^\/+|\/+$/g, ''),
  };
}
async function galleryApi(path, options = {}) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(options.headers || {}) };
  if (state.galleryToken) headers.Authorization = 'Bearer ' + state.galleryToken;
  const res = await fetch('https://api.github.com' + path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && data.message) || `GitHub API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
function bytesToBase64(bytes) {
  let text = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(text);
}
function encodeGitPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function safeUploadName(name) {
  const value = String(name || 'image');
  const dot = value.lastIndexOf('.');
  const ext = dot >= 0 ? value.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
  const base = (dot >= 0 ? value.slice(0, dot) : value).normalize('NFKC').replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'image';
  return base + ext;
}
function safeFolder(name) {
  return String(name || '').replace(/\\/g, '/').split('/').map((part) => part.normalize('NFKC').replace(/[\\/:*?"<>|]+/g, '-').replace(/^\.+$/, '').trim()).filter(Boolean).slice(0, 4).join('/');
}
function formatBytes(n) {
  if (!n || Number.isNaN(+n)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = +n, i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
}
function persistGalleryConfig(values) {
  state.galleryRepo = String(values.galleryRepo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  state.galleryBranch = String(values.galleryBranch || 'main').trim() || 'main';
  state.galleryRoot = String(values.galleryRoot || '').trim().replace(/^\/+|\/+$/g, '');
  state.galleryFolder = String(values.galleryFolder || 'uploads').trim().replace(/^\/+|\/+$/g, '');
  state.galleryToken = String(values.galleryToken || '').trim();
  localStorage.setItem('wb_gallery_repo', state.galleryRepo);
  localStorage.setItem('wb_gallery_branch', state.galleryBranch);
  localStorage.setItem('wb_gallery_root', state.galleryRoot);
  localStorage.setItem('wb_gallery_folder', state.galleryFolder);
  state.galleryToken ? localStorage.setItem('wb_gallery_token', state.galleryToken) : localStorage.removeItem('wb_gallery_token');
  sessionStorage.removeItem('wb_gallery_token');
}
async function loadGalleryFromGitHub(force = false) {
  const cfg = galleryCfg();
  if (!cfg.owner || !cfg.repo) throw new Error('还没有配置图片仓库');
  const cached = cachedData('gallery');
  const cachedAt = Number(localStorage.getItem('wb_gallery_cache_time') || 0);
  const cacheValid = cached && Array.isArray(cached.folders) && cached.folders.every((folder) => Array.isArray(folder.images) && folder.images.every((image) => typeof image === 'string'));
  if (!force && cacheValid && Date.now() - cachedAt < 5 * 60 * 1000) { state.db.gallery = cached; return cached; }
  const tree = await galleryApi(`/repos/${cfg.owner}/${cfg.repo}/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`);
  const prefix = cfg.root ? cfg.root + '/' : '';
  const images = (tree.tree || [])
    .filter((item) => item.type === 'blob' && (!prefix || item.path.startsWith(prefix)) && /\.(jpe?g|png|gif|webp|avif|svg|bmp)$/i.test(item.path))
    .map((item) => {
      const relative = prefix ? item.path.slice(prefix.length) : item.path;
      const parts = relative.split('/');
      return {
        name: parts[parts.length - 1],
        path: item.path,
        group: parts.length > 1 ? parts[0] : '未分组',
        size: item.size || 0,
        url: `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${encodeURIComponent(cfg.branch)}/${encodeGitPath(item.path)}`,
      };
    })
    .sort((a, b) => b.path.localeCompare(a.path));
  const groups = new Map();
  for (const image of images) {
    if (!groups.has(image.group)) groups.set(image.group, []);
    groups.get(image.group).push(image.url);
  }
  const data = { owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, total: images.length, folders: [...groups].map(([name, items]) => ({ name, images: items })) };
  state.db.gallery = data;
  localStorage.setItem('wb_cache_gallery', JSON.stringify(data));
  localStorage.setItem('wb_gallery_cache_time', String(Date.now()));
  return data;
}
async function uploadGalleryFiles(files, folder) {
  const cfg = galleryCfg();
  if (!cfg.owner || !cfg.repo) throw new Error('还没有配置图片仓库');
  if (!state.galleryToken) throw new Error('还没有配置图库 GitHub Token');
  const list = [...files].filter(Boolean);
  if (!list.length) throw new Error('请先选择图片');
  if (list.length > 10) throw new Error('一次最多上传 10 张图片');
  if (list.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024) throw new Error('一批图片总大小不能超过 40 MB');
  for (const file of list) {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} 不是图片文件`);
    if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} 超过 25 MB`);
  }
  state.galleryUploading = true;
  const ref = await galleryApi(`/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`);
  const parentSha = ref.object.sha;
  const parent = await galleryApi(`/repos/${cfg.owner}/${cfg.repo}/git/commits/${parentSha}`);
  const entries = [];
  const stamp = Date.now().toString(36);
  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    state.galleryProgress = `正在读取 ${i + 1}/${list.length}`;
    renderView();
    const bytes = new Uint8Array(await file.arrayBuffer());
    state.galleryProgress = `正在上传 ${i + 1}/${list.length}`;
    renderView();
    const blob = await galleryApi(`/repos/${cfg.owner}/${cfg.repo}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: bytesToBase64(bytes), encoding: 'base64' }),
    });
    const filename = `${stamp}-${i + 1}-${safeUploadName(file.name)}`;
    const path = [cfg.root, safeFolder(folder || cfg.folder), filename].filter(Boolean).join('/');
    entries.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  state.galleryProgress = '正在创建提交';
  renderView();
  const tree = await galleryApi(`/repos/${cfg.owner}/${cfg.repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }),
  });
  const commit = await galleryApi(`/repos/${cfg.owner}/${cfg.repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: `上传 ${list.length} 张图片`, tree: tree.sha, parents: [parentSha] }),
  });
  await galleryApi(`/repos/${cfg.owner}/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  state.galleryUploading = false;
  state.galleryProgress = '';
  return { count: list.length, commit: commit.sha };
}

/* ---------- Cloudflare Worker + D1 同步 ---------- */
function normalizeApiBase(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function apiUrl(path) { return normalizeApiBase(state.apiBase) + path; }
function setApiSession(base, token) {
  state.apiBase = normalizeApiBase(base);
  state.apiToken = token || '';
  state.apiBase ? localStorage.setItem('wb_api_base', state.apiBase) : localStorage.removeItem('wb_api_base');
  state.apiToken ? sessionStorage.setItem('wb_api_token', state.apiToken) : sessionStorage.removeItem('wb_api_token');
  localStorage.removeItem('wb_api_token');
}
function clearApiToken() {
  state.apiToken = '';
  sessionStorage.removeItem('wb_api_token');
  localStorage.removeItem('wb_api_token');
}
async function apiFetch(path, opts = {}) {
  if (!state.apiBase) throw new Error('还没有配置数据服务地址');
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (state.apiToken) headers.Authorization = 'Bearer ' + state.apiToken;
  let res;
  try {
    res = await fetch(apiUrl(path), { ...opts, headers, cache: 'no-store' });
  } catch (e) {
    throw new Error('连不上数据服务，请检查 Worker 地址和网络');
  }
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    const err = new Error((payload && payload.error) || `数据服务请求失败（${res.status}）`);
    err.status = res.status;
    if (res.status === 401) clearApiToken();
    throw err;
  }
  return payload;
}
function defaultData(name) {
  if (name === 'topics') return { statuses: ['待评估', '已立项', '制作中', '待发布', '已发布', '已复盘'], signals: [], items: [] };
  if (name === 'gallery') return { folders: [] };
  if (name === 'sites') return { groups: [], items: [] };
  return { items: [] };
}
async function fetchStaticData(name) {
  const path = name === 'gallery' ? 'gallery/index.json' : `data/${name}.json`;
  const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} 读取失败（${res.status}）`);
  return res.json();
}
function cachedData(name) {
  const raw = localStorage.getItem('wb_cache_' + name);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function applyRemoteData(name, remote) {
  const local = state.dirty.has(name) ? cachedData(name) : null;
  state.db[name] = local || remote || defaultData(name);
  if (!state.dirty.has(name)) localStorage.setItem('wb_cache_' + name, JSON.stringify(state.db[name]));
}
async function loadLocalData(name) {
  const cached = cachedData(name);
  if (cached) { state.db[name] = cached; return true; }
  try {
    state.db[name] = await fetchStaticData(name);
    localStorage.setItem('wb_cache_' + name, JSON.stringify(state.db[name]));
    return true;
  } catch (e) {
    state.db[name] = defaultData(name);
    return false;
  }
}
async function seedRemoteMissing(remote) {
  const current = remote || {};
  const missing = API_KEYS.filter((name) => current[name] === undefined);
  if (!missing.length) return current;
  const seed = {};
  for (const name of missing) {
    const local = state.dirty.has(name) ? cachedData(name) : null;
    seed[name] = local || await fetchStaticData(name);
  }
  await apiFetch('/import', { method: 'POST', body: JSON.stringify({ data: seed }) });
  for (const name of missing) state.dirty.delete(name);
  saveDirty();
  toast(`已把 ${missing.length} 个数据集导入云端`);
  return { ...current, ...seed };
}
function saveDirty() { localStorage.setItem('wb_dirty', JSON.stringify([...state.dirty])); }
const saveTimers = {};
const savingNames = new Set();
async function loadAll() {
  state.sync = 'busy'; updateSyncUI();
  let remote = null;
  let remoteOk = false;
  if (state.apiBase && state.apiToken) {
    try {
      const payload = await apiFetch('/data');
      remote = await seedRemoteMissing(payload && payload.data ? payload.data : {});
      remoteOk = true;
      state.lastErr = '';
    } catch (e) {
      state.lastErr = e.message;
      if (e.status === 401) queueMicrotask(() => showGate('登录已过期，请重新输入密码'));
    }
  }
  for (const name of API_KEYS) {
    if (remoteOk && remote[name] !== undefined) applyRemoteData(name, remote[name]);
    else await loadLocalData(name);
  }
  let galleryOk = false;
  try {
    await loadGalleryFromGitHub();
    galleryOk = true;
  } catch (e) { galleryOk = await loadLocalData('gallery'); }
  state.offline = !remoteOk || !galleryOk;
  state.loaded = true;
  state.sync = !state.apiToken ? 'local' : state.offline ? 'err' : (state.dirty.size ? 'pending' : 'ok');
  updateSyncUI();
  if (state.apiToken && state.dirty.size) {
    [...state.dirty].forEach((name) => queueSave(name, 0));
  }
}
function scheduleSave(name) {
  localStorage.setItem('wb_cache_' + name, JSON.stringify(state.db[name]));
  state.dirty.add(name); saveDirty();
  state.sync = state.apiToken ? 'pending' : 'local';
  updateSyncUI();
  queueSave(name, 450);
}
function queueSave(name, delay = 450) {
  if (!state.apiToken || !API_KEYS.includes(name)) return;
  clearTimeout(saveTimers[name]);
  saveTimers[name] = setTimeout(() => pushFile(name), delay);
}
async function pushFile(name, options = {}) {
  if (!state.apiToken) return false;
  if (savingNames.has(name)) {
    state.dirty.add(name); saveDirty();
    queueSave(name, 700);
    return true;
  }
  savingNames.add(name);
  state.sync = 'busy'; updateSyncUI();
  const snapshot = JSON.stringify(state.db[name]);
  try {
    await apiFetch('/data/' + name, { method: 'PUT', body: snapshot });
    if (JSON.stringify(state.db[name]) === snapshot) state.dirty.delete(name);
    else { state.dirty.add(name); queueSave(name, 250); }
    saveDirty();
    state.sync = state.dirty.size ? 'pending' : 'ok'; state.lastErr = '';
    updateSyncUI();
    return true;
  } catch (e) {
    state.sync = 'err'; state.lastErr = e.message;
    toast((options.manual ? '保存失败：' : '自动保存失败：') + e.message, 'err');
    updateSyncUI();
    if (e.status === 401) queueMicrotask(() => showGate('登录已过期，请重新输入密码'));
    return false;
  } finally {
    savingNames.delete(name);
  }
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
function openModal({ title, body, foot, onMount, wide }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-scrim" data-act="scrim"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
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
const THEME_DEFS = [
  { id: 'retro-blue', label: 'Retro Blue', desc: 'Default palette', swatches: ['#2d6dc3', '#8fb9ff', '#fad13b'], light: { bg: '#fdfaf5', surface: '#ffffff', surface2: '#faf9f5', text: '#2d6dc3', text2: '#3f4a5a', text3: '#7a6550', primary: '#2d6dc3', primaryHover: '#0066ff', soft: '#faf9f5', onPrimary: '#ffffff' }, dark: { bg: '#0b1220', surface: '#0f1b2d', surface2: '#101a2c', text: '#3884eb', text2: '#c5cedb', text3: '#9bb3d7', primary: '#3884eb', primaryHover: '#8fb9ff', soft: '#3884eb26', onPrimary: '#ffffff' } },
  { id: 'minimal-mono', label: 'Minimal Mono', desc: 'Monochrome palette', swatches: ['#11110f', '#1a1917', '#d8d5cf'], light: { bg: '#fdfcfc', surface: '#ffffff', surface2: '#f5f3f1', text: '#1a1a1a', text2: '#57534f', text3: '#777169', primary: '#1a1a1a', primaryHover: '#333333', soft: '#f5f3f1', onPrimary: '#ffffff' }, dark: { bg: '#11110f', surface: '#1a1917', surface2: '#151411', text: '#f4f4f2', text2: '#d8d5cf', text3: '#aaa49b', primary: '#f4f4f2', primaryHover: '#ffffff', soft: '#f4f4f21f', onPrimary: '#11110f' } },
  { id: 'forest-green', label: 'Forest Green', desc: 'Botanical palette', swatches: ['#4a7c59', '#8fba98', '#dce9d8'], light: { bg: '#f7f5f0', surface: '#ffffff', surface2: '#f5f2ee', text: '#2f6840', text2: '#33443a', text3: '#66736a', primary: '#4a7c59', primaryHover: '#356644', soft: '#eef5ea', onPrimary: '#ffffff' }, dark: { bg: '#0f1712', surface: '#162119', surface2: '#111c15', text: '#91c89d', text2: '#d5ded7', text3: '#9daf9f', primary: '#91c89d', primaryHover: '#b8ddb8', soft: '#91c89d26', onPrimary: '#0f1712' } },
  { id: 'vellum-ink', label: 'Vellum Ink', desc: 'Warm vellum palette', swatches: ['#141413', '#1f1e1d', '#d97757'], light: { bg: '#faf9f5', surface: '#ffffff', surface2: '#f4f1ea', text: '#141413', text2: '#3d3d3a', text3: '#73726c', primary: '#141413', primaryHover: '#1f1e1d', soft: '#f1eee7', onPrimary: '#ffffff' }, dark: { bg: '#141413', surface: '#1f1e1d', surface2: '#191816', text: '#faf9f5', text2: '#dedcd1', text3: '#9c9a92', primary: '#faf9f5', primaryHover: '#ffffff', soft: '#faf9f51f', onPrimary: '#141413' } },
  { id: 'creator-yellow', label: 'Creator Yellow', desc: 'Creator economy palette', swatches: ['#ffdd00', '#f7d046', '#d8573f'], light: { bg: '#e5e7eb', surface: '#ffffff', surface2: '#f3f4f6', text: '#222222', text2: '#414141', text3: '#717171', primary: '#ffdd00', primaryHover: '#f7d046', soft: '#fff6b8', onPrimary: '#000000' }, dark: { bg: '#171510', surface: '#222222', surface2: '#1f1c13', text: '#fff8d1', text2: '#f5f0c4', text3: '#c7bd78', primary: '#ffdd00', primaryHover: '#f7d046', soft: '#ffdd0026', onPrimary: '#000000' } },
  { id: 'precision-orange', label: 'Precision Orange', desc: 'Technical neutral palette', swatches: ['#020202', '#3d3a39', '#ef6f2e'], light: { bg: '#eeeeee', surface: '#fafafa', surface2: '#f4f4f4', text: '#020202', text2: '#3d3a39', text3: '#756f6b', primary: '#020202', primaryHover: '#3d3a39', soft: '#e6e4e2', onPrimary: '#ffffff' }, dark: { bg: '#101010', surface: '#1a1817', surface2: '#171615', text: '#f2e8e2', text2: '#d8cbc3', text3: '#a49d9a', primary: '#ff9a62', primaryHover: '#ffb08a', soft: '#ff9a6226', onPrimary: '#101010' } },
  { id: 'comic-pulp', label: 'Comic Pulp', desc: 'Soft comic palette', swatches: ['#6b5fb5', '#c8c1f0', '#f2dc4d'], light: { bg: '#fbf7ea', surface: '#fffdf5', surface2: '#f4efff', text: '#241c3d', text2: '#473f67', text3: '#806f4b', primary: '#f2dc4d', primaryHover: '#f6cc5f', soft: '#eeeaff', onPrimary: '#241c3d' }, dark: { bg: '#18152d', surface: '#252040', surface2: '#211c3a', text: '#f2dc4d', text2: '#f6f0d1', text3: '#c8c1f0', primary: '#f2dc4d', primaryHover: '#f6cc5f', soft: '#f2dc4d29', onPrimary: '#241c3d' } },
  { id: 'midnight-pastel', label: 'Midnight Pastel', desc: 'Dark pastel palette', swatches: ['#000000', '#bbb2ce', '#e4b976'], light: { bg: '#f3f1ec', surface: '#ffffff', surface2: '#e5e6e1', text: '#453b60', text2: '#333333', text3: '#65451d', primary: '#65451d', primaryHover: '#453b60', soft: '#ebe7f3', onPrimary: '#ffffff' }, dark: { bg: '#000000', surface: '#121212', surface2: '#0b0b0b', text: '#bbb2ce', text2: '#ffffff', text3: '#e4b976', primary: '#bbb2ce', primaryHover: '#e4b976', soft: '#bbb2ce29', onPrimary: '#000000' } },
];
const THEME_LINKS = {
  'retro-blue': ['#2d6dc3', '#3884eb'], 'minimal-mono': ['#1a1a1a', '#f4f4f2'], 'forest-green': ['#2f6840', '#91c89d'], 'vellum-ink': ['#141413', '#faf9f5'], 'creator-yellow': ['#222222', '#ffdd00'], 'precision-orange': ['#020202', '#ff9a62'], 'comic-pulp': ['#6b5fb5', '#f2dc4d'], 'midnight-pastel': ['#453b60', '#bbb2ce'],
};
function themeById(id) { return THEME_DEFS.find((theme) => theme.id === id) || THEME_DEFS[0]; }
function applyPalette(id) {
  const theme = themeById(id);
  const mode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const p = theme[mode];
  const root = document.documentElement;
  root.dataset.palette = theme.id;
  root.style.setProperty('--bg', p.bg);
  root.style.setProperty('--surface', p.surface);
  root.style.setProperty('--surface-2', p.surface2);
  root.style.setProperty('--chip', p.surface2);
  root.style.setProperty('--border', `color-mix(in srgb, ${p.text} 12%, ${p.surface})`);
  root.style.setProperty('--border-strong', `color-mix(in srgb, ${p.text} 24%, ${p.surface})`);
  root.style.setProperty('--text', p.text);
  root.style.setProperty('--text-2', p.text2);
  root.style.setProperty('--text-3', p.text3);
  root.style.setProperty('--accent', p.primary);
  root.style.setProperty('--accent-strong', p.primaryHover);
  root.style.setProperty('--accent-soft', p.soft);
  root.style.setProperty('--accent-text', THEME_LINKS[theme.id]?.[mode === 'dark' ? 1 : 0] || p.text);
  root.style.setProperty('--on-accent', p.onPrimary);
  localStorage.setItem('wb_palette', theme.id);
}
function themeModal() {
  const current = themeById(localStorage.getItem('wb_palette') || 'retro-blue');
  const dark = document.documentElement.dataset.theme === 'dark';
  openModal({
    title: '主题',
    body: `<div class="theme-dialog-head">
        <div><b>${esc(current.label)}</b><span>${esc(current.desc)}</span></div>
        <button class="btn ghost" data-act="toggleTheme">${ic(dark ? 'sun' : 'moon')}${dark ? '浅色模式' : '深色模式'}</button>
      </div>
      <div class="theme-list">${THEME_DEFS.map((theme) => `
        <button class="theme-option ${theme.id === current.id ? 'active' : ''}" data-act="setPalette" data-palette-id="${theme.id}">
          <span class="theme-swatches">${theme.swatches.map((color) => `<i style="background:${color}"></i>`).join('')}</span>
          <span class="theme-copy"><b>${esc(theme.label)}</b><small>${esc(theme.desc)}</small></span>
          <span class="theme-selected">${theme.id === current.id ? ic('check') : ''}</span>
        </button>`).join('')}</div>`,
    foot: `<button class="btn primary" data-act="closeModal">完成</button>`,
  });
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('wb_theme', t);
  applyPalette(localStorage.getItem('wb_palette') || 'retro-blue');
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
    calendar: (d.topics?.items || []).filter((t) => t.eta && t.eta >= todayISO()).length,
    gallery: (d.gallery?.folders || []).reduce((n, f) => n + f.images.length, 0),
  };
}
const MODULES = [
  { mod: 'todo', icon: 'listCheck', label: '今日待办' },
  { mod: 'ideas', icon: 'bulb', label: '灵感速记' },
  { mod: 'topics', icon: 'board', label: '选题中枢' },
  { mod: 'calendar', icon: 'calendar', label: '日历排期' },
  { mod: 'prompts', icon: 'sparkle', label: '提示词库' },
  { mod: 'sites', icon: 'globe', label: '网站收藏' },
  { mod: 'gallery', icon: 'image', label: '素材图库' },
];
const DEFAULT_ORDER = ['todo', 'ideas', 'topics', 'calendar', 'prompts', 'sites', 'gallery'];
function routeFor(mod) {
  return { mod, view: mod === 'todo' ? 'all' : mod === 'topics' ? 'board' : mod === 'prompts' ? 'all' : 'main' };
}
function loadModOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem('wb_mod_order') || '[]');
    if (Array.isArray(saved) && saved.length === MODULES.length && saved.every((m) => MODULES.some((x) => x.mod === m))) return saved;
  } catch (e) {}
  return DEFAULT_ORDER.slice();
}
state.modOrder = loadModOrder();
state.route = routeFor(state.modOrder[0]);
function syncInfo() {
  const map = {
    ok: ['ok', '已保存', '已同步到云端'],
    pending: ['pending', '等待保存', '改动会自动保存'],
    busy: ['busy', '正在保存', '请稍候'],
    err: ['err', '保存失败', '请检查网络或连接'],
    local: ['local', '未登录', '请连接数据服务'],
    init: ['busy', '加载中', '请稍候'],
  };
  const [cls, label, sub] = map[state.sync] || map.init;
  return `<button class="sync-pill ${cls}" data-act="syncReload" title="点击从云端拉取最新数据">
    <span class="dot"></span><span><b>${label}</b><br>${esc(sub)}</span></button>`;
}
function renderSidebar() {
  const c = navCounts();
  const items = state.modOrder.map((mod) => {
    const m = MODULES.find((x) => x.mod === mod);
    return `<button class="nav-item ${state.route.mod === m.mod ? 'active' : ''}" draggable="true" data-act="nav" data-mod="${m.mod}" title="拖动可调换顺序">
      ${ic(m.icon)}<span>${m.label}</span>
      <span class="nv-count num">${c[m.mod]}</span>
    </button>`;
  }).join('');
  $('#sidebar').innerHTML = `
    <div class="brand"><div class="brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><rect x="5" y="9" width="38" height="9" rx="4.5" fill="currentColor"/><rect x="5" y="20" width="30" height="9" rx="4.5" fill="currentColor" opacity=".55"/><rect x="5" y="31" width="38" height="9" rx="4.5" fill="currentColor" opacity=".28"/></svg></div>
      <div class="brand-name">NickWork</div>
    </div>
    <nav class="nav"><div class="nav-label">模块</div>${items}</nav>
    <div class="side-foot">
      <button class="sync-now" data-act="syncNow">${ic('refresh')}<span>同步</span></button>
      ${syncInfo()}
      <div class="side-actions">
        <button class="side-btn" data-act="openThemes">${ic('palette')}<span>主题</span></button>
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
  const fns = { todo: viewTodo, topics: viewTopics, prompts: viewPrompts, sites: viewSites, ideas: viewIdeas, calendar: viewCalendar, gallery: viewGallery };
  v.innerHTML = `<div class="view-body">${(fns[state.route.mod] || viewTodo)()}</div>`;
  const bar = `<div class="mobile-bar"><button class="icon-btn" data-act="openSide" aria-label="菜单">${ic('menu')}</button>
    <span class="mb-title">${MODULES.find((m) => m.mod === state.route.mod)?.label || ''}</span></div>`;
  v.insertAdjacentHTML('afterbegin', bar);
  if (state.offline) v.insertAdjacentHTML('beforeend', `<div class="banner">${ic('alert')} 网络不佳，当前显示的是本机缓存，刷新后自动重试。</div>`);
}

function renderAll() { renderSidebar(); renderView(); }

/* ---------- 今日待办 ---------- */
function taskCard(t, today) {
  const due = t.due;
  const overdue = !t.done && due && due < today;
  return `<div class="panel task-card ${t.done ? 'done' : ''}" data-id="${t.id}">
    <div class="tc-top">
      <button class="checkbox ${t.done ? 'checked' : ''}" data-act="toggleTask" data-id="${t.id}" aria-label="完成">${ic('check', 'ic')}</button>
      ${t.priority ? `<span class="pill ${PRIO[t.priority] || 'p-low'}">${t.priority}</span>` : ''}
      ${due ? `<span class="link-tag ${overdue ? 'overdue' : ''}">${ic('clock')}截止 ${fmtMD(due)}${overdue ? ' 已逾期' : ''}</span>` : ''}
    </div>
    <div class="tc-text">${esc(t.text)}</div>
    <div class="tc-meta">${t.link ? `<span class="link-tag">关联：${LINK_NAME[t.link] || t.link}</span>` : ''}${t.note ? `<span class="link-tag">备注：${esc(t.note)}</span>` : ''}</div>
    <div class="tc-foot">
      ${t.done ? '' : `<button class="btn sm ghost" data-act="taskToTopic" data-id="${t.id}">转选题</button>
      <button class="btn sm ghost" data-act="taskToPrompt" data-id="${t.id}">转提示词</button>`}
      <span class="spacer"></span>
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
  const tabs = tabsHTML('todo', [['all', '全部任务'], ['focus', '今日焦点'], ['done', '已完成']], v)
    + ` <button class="btn primary" data-act="addTask">${ic('plus')}新增任务</button>`;
  let list, empty;
  if (v === 'done') {
    list = done.sort((a, b) => (a.created < b.created ? 1 : -1));
    empty = emptyHTML('listCheck', '还没有已完成的任务', '完成任务后它会出现在这里，作为你的产出记录。');
  } else if (v === 'focus') {
    list = sortTasks(pending.filter((t) => t.due && t.due <= today));
    empty = emptyHTML('check', '今天没有到期任务', '到期或逾期的任务会自动进入今日焦点。');
  } else {
    list = sortTasks(pending);
    empty = emptyHTML('plus', '还没有任务', '点右上角「新增任务」，添加第一件事。');
  }
  return head('今日待办', `${new Date().getMonth() + 1}月${new Date().getDate()}日 ${WEEK[new Date().getDay()]}`, tabs) + `
    <div class="stat-row todo-stats">
      <div class="stat"><div class="v num">${pending.length}</div><div class="k">未完成</div></div>
      <div class="stat"><div class="v num">${todayDue}</div><div class="k">今日到期</div></div>
      <div class="stat ${overdue ? 'warn' : 'dim'}"><div class="v num">${overdue}</div><div class="k">逾期</div></div>
      <div class="stat dim"><div class="v num">${done.length}</div><div class="k">已完成</div></div>
    </div>
    ${list.length ? `<div class="task-grid">${list.map((t) => taskCard(t, today)).join('')}</div>`
      : `<div class="panel">${empty}</div>`}`;
}
function taskModal() {
  openModal({
    title: '新增任务',
    body: `<form id="task-form"><div class="form-grid">
      <div class="field full"><label>任务内容</label><textarea class="textarea" name="text" rows="2" placeholder="一句能直接开工的动作句" required></textarea></div>
      <div class="field"><label>优先级</label><select class="select" name="priority" style="width:100%"><option>高</option><option selected>中</option><option>低</option></select></div>
      <div class="field"><label>截止日（可选）</label><input class="input" type="date" name="due"></div>
      <div class="field"><label>关联模块</label><select class="select" name="link" style="width:100%"><option value="">不关联</option><option value="topics">选题中枢</option><option value="prompts">提示词库</option><option value="sites">网站收藏</option></select></div>
      <div class="field"><label>备注（可选）</label><input class="input" name="note" placeholder="补充信息"></div>
    </div></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button>
      <button class="btn primary" type="submit" form="task-form">${ic('check')}添加任务</button>`,
  });
  $('#task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    if (!f.text.trim()) return;
    newTask(f.text.trim(), f.priority, f.due || null, f.link || null, (f.note || '').trim());
    closeModal();
    toast('任务已添加');
  });
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
      <button class="icon-btn" data-act="toggleHideTopic" data-id="${t.id}" title="从看板隐藏">${ic('eyeOff')}</button>
      <button class="icon-btn danger" data-act="delTopic" data-id="${t.id}" aria-label="删除">${ic('trash')}</button>
    </div>
  </div>`;
}
function laneSort(a, b) {
  const p = (PRIO_ORD[a.priority] ?? 9) - (PRIO_ORD[b.priority] ?? 9);
  if (p) return p;
  const ae = a.eta || '9999-99-99', be = b.eta || '9999-99-99';
  if (ae !== be) return ae < be ? -1 : 1;
  return a.created < b.created ? 1 : -1;
}
function lanesHTML(list) {
  const st = state.db.topics.statuses;
  const shown = list.filter((t) => !t.hidden);
  const html = st.map((s) => {
    const cards = shown.filter((t) => t.status === s).sort(laneSort);
    if (!cards.length) return '';
    const n = Math.min(cards.length, 3);
    return `<div class="group g${n}">
      <div class="lane-head"><span class="t">${s}</span><span class="c num">${cards.length}</span></div>
      <div class="g-cards c${n}">${cards.map(topicCard).join('')}</div>
    </div>`;
  }).join('');
  return `<div class="board">${html || `<div class="panel">${emptyHTML('board', '看板是空的', '点右上角「新建选题」，或把热榜信号一键转为选题。')}</div>`}</div>`;
}
function hiddenFoldHTML(list) {
  const hidden = list.filter((t) => t.hidden);
  if (!hidden.length) return '';
  return `<div class="hidden-fold ${state.showHidden ? 'open' : ''}">
    <button class="hidden-fold-head" data-act="toggleShowHidden">${ic('chevR')}已隐藏的选题（${hidden.length}）</button>
    ${state.showHidden ? `<div class="hidden-list">${hidden.map((h) => `
      <div class="hidden-row">
        <span class="pill ${PLAT_CLS[h.platform] || 'p-platform'}" style="flex:none">${esc(h.platform)}</span>
        <a href="#" class="h-title" data-act="editTopic" data-id="${h.id}" style="color:inherit">${esc(h.title)}</a>
        <span style="font-size:11.5px;color:var(--text-3);flex:none">${esc(h.status)}</span>
        <button class="btn sm ghost" data-act="toggleHideTopic" data-id="${h.id}">恢复</button>
        <button class="icon-btn danger" data-act="delTopic" data-id="${h.id}" aria-label="删除">${ic('trash')}</button>
      </div>`).join('')}</div>` : ''}
  </div>`;
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
    ${lanesHTML(d.items)}
    ${hiddenFoldHTML(d.items)}</div>`;
  } else if (v === 'renew') {
    const list = d.items.filter((t) => t.source === '旧选题');
    body = `<div class="banner">${ic('bulb')} 这里汇集来源为「旧选题」的内容，适合翻新重做或二次剪辑。</div>${lanesHTML(list)}`;
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
  return head('选题中枢', '从热榜信号到复盘数据的完整流水线', tabs + `
    <button class="btn ghost" data-act="syncFeishu" title="从飞书多维表格拉取选题">${ic('refresh')}从飞书同步</button>
    <button class="btn primary" data-act="addTopic">${ic('plus')}新建选题</button>`) + `
    <div class="stat-row">
      <div class="stat"><div class="v num">${counts['待评估'] || 0}</div><div class="k">待评估</div></div>
      <div class="stat dim"><div class="v num">${counts['制作中'] || 0}</div><div class="k">制作中</div></div>
      <div class="stat dim"><div class="v num">${counts['待发布'] || 0}</div><div class="k">待发布</div></div>
      <div class="stat dim"><div class="v num">${(counts['已发布'] || 0) + (counts['已复盘'] || 0)}</div><div class="k">已发布</div></div>
    </div>${body}`;
}
function viewCalendar() {
  const items = state.db.topics?.items || [];
  const upcoming = items.filter((t) => t.eta && t.eta >= todayISO()).length;
  return head('日历排期', `还有 ${upcoming} 个选题待发布，点日期上的卡片可编辑`, ` <button class="btn primary" data-act="addTopic">${ic('plus')}新建选题</button>`) + calendarHTML();
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
  const linked = (state.db.topics?.items || []).filter((t) => (t.prompts || []).includes(p.id)).length;
  return `<div class="panel prompt-card" data-act="openPrompt" data-id="${p.id}">
    <div class="p-head">
      <span class="pill p-type">${esc(p.type)}</span>
      <span class="p-title">${esc(p.title)}</span>
      <button class="icon-btn star ${p.favorite ? 'on' : ''}" data-act="toggleFav" data-id="${p.id}" aria-label="收藏" style="${p.favorite ? 'color:var(--warn)' : ''}">${ic('star')}</button>
    </div>
    <div class="p-body">${esc(p.body || '') || '<span style="color:var(--text-3)">暂无正文，点开补充</span>'}</div>
    <div class="p-meta">${(p.tags || []).map((tg) => `<span class="pill p-src">${esc(tg)}</span>`).join('')}
      ${meta.map((m) => `<span class="link-tag">${esc(m)}</span>`).join('')}
      ${linked ? `<span class="link-tag">${ic('board')} 关联 ${linked}</span>` : ''}</div>
  </div>`;
}
function promptDetailModal(p) {
  const topics = (state.db.topics?.items || []).filter((t) => (t.prompts || []).includes(p.id));
  const rows = [];
  if (p.type === '文生图') { if (p.model) rows.push(['模型', p.model]); if (p.vars?.length) rows.push(['变量', p.vars.join('、')]); }
  else { if (p.lens) rows.push(['镜头运动', p.lens]); if (p.duration) rows.push(['时长', p.duration]); if (p.ref) rows.push(['参考图/视频', p.ref]); if (p.log) rows.push(['成功记录', p.log]); }
  openModal({
    title: p.title,
    wide: true,
    body: `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <span class="pill p-type">${esc(p.type)}</span>
        ${(p.tags || []).map((tg) => `<span class="pill p-src">${esc(tg)}</span>`).join('')}
      </div>
      <div class="detail-block">${esc(p.body || '') || '<span style="color:var(--text-3)">暂无正文，点下方「编辑」补充</span>'}</div>
      ${rows.length ? `<div class="detail-rows">${rows.map(([k, v]) => `<div class="d-row"><span class="d-k">${k}</span><span class="d-v">${esc(v)}</span></div>`).join('')}</div>` : ''}
      ${topics.length ? `<div class="d-row"><span class="d-k">关联选题</span><span class="d-v">${topics.map((t) => esc(t.title)).join('、')}</span></div>` : ''}`,
    foot: `<button class="btn danger-ghost" data-act="delPrompt" data-id="${p.id}" style="margin-right:auto">${ic('trash')}删除</button>
      <button class="btn ghost" data-act="linkPrompt" data-id="${p.id}">关联选题</button>
      <button class="btn ghost" data-act="editPrompt" data-id="${p.id}">编辑</button>
      <button class="btn primary" data-act="copyPrompt" data-id="${p.id}">${ic('copy')}复制提示词</button>`,
  });
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
  const durations = ['5秒', '10秒', '15秒', '20秒', '30秒'];
  const curDur = p?.duration || '';
  const durOpts = (curDur && !durations.includes(curDur) ? [curDur, ...durations] : durations)
    .map((d) => `<option value="${esc(d)}" ${d === curDur ? 'selected' : ''}>${esc(d)}</option>`).join('');
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
      <div class="field"><label>时长（Seedance）</label><select class="select" name="duration" style="width:100%"><option value="" ${curDur ? '' : 'selected'}>不限</option>${durOpts}</select></div>
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

/* ---------- 网站收藏 ---------- */
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
  return head('网站收藏', `${groups.length} 个分组，${d.items.length} 个网站`, tabs + `
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
function ideaCard(i) {
  const summary = i.text.length > 20 ? i.text.slice(0, 20) + '…' : i.text;
  return `<div class="panel idea-card ${i.processed ? 'done' : ''}" data-act="openIdea" data-id="${i.id}">
    <div class="i-text">${esc(summary)}</div>
    <div class="i-time">${relTime(i.created)}${i.processed ? ' · 已处理' : ''}</div>
  </div>`;
}
function ideaModal(i) {
  openModal({
    title: '灵感详情',
    wide: true,
    body: `<div class="detail-block" style="max-height:none;font-size:13.5px">${esc(i.text)}</div>
      <div class="d-row" style="border-top:none;padding-top:12px"><span class="d-k">记录时间</span><span class="d-v">${relTime(i.created)}</span></div>
      ${i.processed ? '<div class="d-row"><span class="d-k">状态</span><span class="d-v">已处理</span></div>' : ''}`,
    foot: `${i.processed ? '' : `<button class="btn ghost" data-act="ideaToTask" data-id="${i.id}">转待办</button>
      <button class="btn ghost" data-act="ideaToTopic" data-id="${i.id}">转选题</button>
      <button class="btn ghost" data-act="ideaToPrompt" data-id="${i.id}">转提示词</button>`}
      <span style="flex:1"></span>
      <button class="btn danger-ghost" data-act="delIdea" data-id="${i.id}">${ic('trash')}删除</button>
      <button class="btn ghost" data-act="toggleIdea" data-id="${i.id}">${i.processed ? '标回待处理' : '标记已处理'}</button>`,
  });
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
    ${list.length ? `<div class="idea-grid" style="margin-top:14px">${list.map(ideaCard).join('')}</div>`
      : `<div class="panel" style="margin-top:14px">${emptyHTML('bulb', '没有待处理的灵感', '上面的输入框想到就记，之后再转成任务、选题或提示词。')}</div>`}`;
}

/* ---------- 图库 ---------- */
function viewGallery() {
  const folders = state.db.gallery?.folders || [];
  const total = folders.reduce((n, f) => n + f.images.length, 0);
  const cfg = galleryCfg();
  const cur = state.route.view && state.route.view !== 'main' ? state.route.view : null;
  if (cur) {
    const f = folders.find((x) => x.name === cur);
    if (f) {
      const source = [cfg.repo, cfg.root, f.name].filter(Boolean).join('/');
      return head(f.name, `${f.images.length} 张图 · 来自仓库 ${source}`, `<a class="btn ghost" href="#/gallery">${ic('chevL')}返回素材图库</a>`) + `
        <div class="gallery-grid">${f.images.map((src, i) => `
          <button class="g-img" data-act="openLb" data-folder="${esc(f.name)}" data-i="${i}" aria-label="查看大图">
            <img src="${esc(src)}" loading="lazy" alt="">
          </button>`).join('')}</div>`;
    }
  }
  const uploadButton = `<button class="btn primary" data-act="galleryUpload" ${state.galleryUploading ? 'disabled' : ''}>${ic('plus')}${state.galleryUploading ? '上传中…' : '上传图片'}</button>`;
  return head('素材图库', folders.length ? `${folders.length} 个文件夹，共 ${total} 张图` : '图片来自你的 GitHub 图床仓库', uploadButton) + `
    ${state.galleryUploading ? `<div class="panel gallery-upload-status">${ic('refresh')}<span>${esc(state.galleryProgress || '正在上传')}</span></div>` : ''}
    ${folders.length ? `<div class="gallery-folders">${folders.map((f) => `
      <a class="panel gallery-folder" href="#/gallery/${encodeURIComponent(f.name)}">
        <img class="gf-cover" src="${esc(f.images[0])}" alt="${esc(f.name)}" loading="lazy">
        <div class="gf-info"><div class="gf-name">${esc(f.name)}</div><div class="gf-cnt num">${f.images.length} 张</div></div>
      </a>`).join('')}</div>`
      : `<div class="panel">${emptyHTML('image', '素材图库还是空的', '点击右上角「上传图片」，图片会保存到你的 GitHub 图床仓库。')}</div>`}`;
}
function galleryUploadModal() {
  const cfg = galleryCfg();
  if (!state.galleryToken || !cfg.owner || !cfg.repo) {
    toast('请先在设置里配置图库仓库和 GitHub Token', 'err');
    settingsModal();
    return;
  }
  openModal({
    title: '上传图片到图库',
    body: `<form id="gallery-upload-form">
      <label class="upload-drop" id="gallery-drop">
        <input type="file" id="gallery-file-input" accept="image/*" multiple hidden>
        <span class="upload-drop-icon">${ic('plus')}</span>
        <b>点击选择或拖入图片</b>
        <small>最多 10 张，单张 25 MB，总计 40 MB</small>
      </label>
      <div class="form-grid" style="margin-top:14px">
        <div class="field full"><label>上传到仓库</label><input class="input" value="${esc(cfg.owner + '/' + cfg.repo)}" disabled></div>
        <div class="field full"><label>子目录</label><input class="input" name="folder" value="${esc(state.galleryFolder)}" placeholder="uploads"></div>
      </div>
      <div class="gallery-upload-files" id="gallery-upload-files"></div>
    </form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" id="gallery-upload-go" type="button" disabled>开始上传</button>`,
  });
  let files = [];
  const input = $('#gallery-file-input');
  const drop = $('#gallery-drop');
  const list = $('#gallery-upload-files');
  const button = $('#gallery-upload-go');
  const setFiles = (next) => {
    files = [...next].filter((file) => file.type.startsWith('image/')).slice(0, 10);
    list.innerHTML = files.length ? files.map((file) => `<div class="gallery-upload-file"><span>${esc(file.name)}</span><small>${formatBytes(file.size)}</small></div>`).join('') : '';
    button.disabled = !files.length;
    button.textContent = files.length ? `上传 ${files.length} 张` : '开始上传';
  };
  input.addEventListener('change', () => setFiles(input.files));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('dragging'); setFiles(e.dataTransfer.files); });
  button.addEventListener('click', async () => {
    const folder = $('#gallery-upload-form').folder.value || state.galleryFolder;
    closeModal();
    state.galleryUploading = true; state.galleryProgress = '准备上传'; renderView();
    try {
      const result = await uploadGalleryFiles(files, folder);
      await loadGalleryFromGitHub(true);
      toast(`已上传 ${result.count} 张图片`);
    } catch (e) {
      toast('上传失败：' + e.message, 'err');
    } finally {
      state.galleryUploading = false; state.galleryProgress = ''; renderAll();
    }
  });
}
function openLightbox(folderName, i) {
  const f = (state.db.gallery?.folders || []).find((x) => x.name === folderName);
  if (!f) return;
  renderLb({ folder: f, i });
}
function renderLb(lb) {
  state.lb = lb;
  const { folder, i } = lb;
  $('#lb-root').innerHTML = `<div class="lb-scrim" data-act="closeLb">
    <img class="lb-img" src="${esc(folder.images[i])}" alt="">
    <div class="lb-bar">
      <span class="num">${i + 1} / ${folder.images.length}</span>
      <span class="lb-name">${esc(folder.name)}</span>
      <a class="btn sm ghost" href="${esc(folder.images[i])}" target="_blank" rel="noopener">原图</a>
    </div>
    ${folder.images.length > 1 ? `
      <button class="lb-nav lb-prev" data-act="lbPrev" aria-label="上一张">${ic('chevL')}</button>
      <button class="lb-nav lb-next" data-act="lbNext" aria-label="下一张">${ic('chevR')}</button>` : ''}
  </div>`;
}
function closeLightbox() { $('#lb-root').innerHTML = ''; state.lb = null; }

/* ---------- 动作 ---------- */
function newTask(text, priority, due, link, note) {
  state.db.tasks.items.push({ id: uid(), text, priority, due: due || null, done: false, link: link || null, note: note || '', created: new Date().toISOString() });
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
  addTask: () => taskModal(),
  nav: (id, el) => { state.route = routeFor(el.dataset.mod); location.hash = '#/' + el.dataset.mod; closeSide(); renderAll(); window.scrollTo(0, 0); },
  tab: (id, el) => {
    const { mod, view } = el.dataset;
    if (mod === 'prompts') state.promptFilter = view;
    else if (mod === 'sites') state.siteFilter = view;
    else if (mod === 'ideas') state.ideaFilter = view;
    else state.route.view = view;
    renderView(); renderSidebar();
  },
  toggleTheme: () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); renderSidebar(); themeModal(); },
  openSide: () => { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; },
  closeModal: () => closeModal(),
  scrim: (id, el, e) => { if (e.target === el) closeModal(); },
  openThemes: () => themeModal(),
  setPalette: (id, el) => { applyPalette(el.dataset.paletteId); closeModal(); renderAll(); },
  togglePassword: (id, el) => {
    const input = document.getElementById(el.dataset.target);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.innerHTML = ic(show ? 'eyeOff' : 'eye');
    el.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    input.focus();
  },
  openSettings: () => settingsModal(),
  syncNow: async (id, el) => {
    if (!state.apiBase || !state.apiToken) { toast('请先登录数据服务', 'err'); showGate(); return; }
    if (el) el.disabled = true;
    const dirty = [...state.dirty];
    if (!dirty.length) { toast('所有改动都已自动保存'); if (el) el.disabled = false; return; }
    let ok = true;
    for (const name of dirty) { const r = await pushFile(name, { manual: true }); if (!r) ok = false; }
    if (el) el.disabled = false;
    if (!ok) { toast('部分数据保存失败，稍后会继续自动重试', 'err'); return; }
    state.sync = 'ok';
    renderSidebar();
    toast(`已保存 ${dirty.length} 个数据集`);
  },
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
  toggleHideTopic: (id) => {
    const t = state.db.topics.items.find((x) => x.id === id);
    t.hidden = !t.hidden;
    scheduleSave('topics'); renderAll();
    toast(t.hidden ? '已从看板隐藏，在底部「已隐藏的选题」里找回' : '已恢复显示');
  },
  toggleShowHidden: () => { state.showHidden = !state.showHidden; renderView(); },
  editStats: (id) => statsModal(state.db.topics.items.find((x) => x.id === id)),
  syncFeishu: async () => {
    if (!state.feishuUrl) { toast('先在设置里填飞书同步地址', 'err'); settingsModal(); return; }
    toast('正在从飞书拉取…');
    try {
      const res = await fetch(state.feishuUrl.replace(/\/+$/, '') + '/topics', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const d = state.db.topics;
      const existing = new Set(d.items.map((t) => t.title));
      const fresh = (j.topics || []).map((t) => ({
        title: String(t.title || '').trim(),
        platform: ['公众号', '小红书', '抖音'].includes(t.platform) ? t.platform : '小红书',
        source: t.source || '灵感',
        status: d.statuses.includes(t.status) ? t.status : '待评估',
        priority: ['高', '中', '低'].includes(t.priority) ? t.priority : '中',
        eta: typeof t.eta === 'number' ? new Date(t.eta).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) : (t.eta || null),
        url: t.url || '',
      })).filter((t) => t.title && !existing.has(t.title));
      if (!fresh.length) { toast('飞书里没有看板上没有的新选题'); return; }
      openModal({
        title: '从飞书导入选题',
        body: `<p style="margin:2px 0 10px;color:var(--text-2)">拉到 ${(j.topics || []).length} 条，其中 ${fresh.length} 条是看板上没有的。勾选要导入的（可搜索）：</p>
          <input class="input" id="fs-filter" placeholder="搜索标题关键字" style="width:100%;margin-bottom:8px">
          <div id="fs-list" style="max-height:320px;overflow:auto">${fresh.map((t, i) => `
            <label class="fs-row" data-title="${esc(t.title.toLowerCase())}">
              <input type="checkbox" class="fs-ck" data-i="${i}">
              <span class="pill ${PLAT_CLS[t.platform] || 'p-platform'}" style="flex:none">${esc(t.platform)}</span>
              <span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(t.title)}</span>
              ${t.eta ? `<span class="num" style="font-size:11.5px;color:var(--text-3);flex:none">${esc(t.eta)}</span>` : ''}
            </label>`).join('')}</div>`,
        foot: `<button class="btn ghost" data-act="closeModal">取消</button>
          <button class="btn sm ghost" id="fs-all" style="margin-right:auto">全选</button>
          <button class="btn primary" id="fs-import">导入</button>`,
      });
      const fsRows = () => $$('#fs-list .fs-row');
      $('#fs-filter').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase();
        fsRows().forEach((r) => { r.style.display = r.dataset.title.includes(q) ? '' : 'none'; });
      });
      $('#fs-all').addEventListener('click', () => fsRows().forEach((r) => { r.querySelector('.fs-ck').checked = true; }));
      const updateCount = () => { $('#fs-import').textContent = '导入 ' + $$('#fs-list .fs-ck:checked').length + ' 条'; };
      $$('#fs-list .fs-ck').forEach((cb) => cb.addEventListener('change', updateCount));
      updateCount();
      $('#fs-import').addEventListener('click', () => {
        const picked = $$('#fs-list .fs-ck:checked').map((cb) => fresh[+cb.dataset.i]);
        if (!picked.length) { toast('先勾选要导入的选题', 'err'); return; }
        picked.forEach((t) => newTopic(t));
        closeModal();
        toast('已导入 ' + picked.length + ' 条选题');
      });
    } catch (e) {
      toast('飞书拉取失败：' + e.message, 'err');
    }
  },
  addSignal: () => {},
  toggleSignal: (id) => { const s = state.db.topics.signals.find((x) => x.id === id); s.handled = !s.handled; scheduleSave('topics'); renderAll(); },
  delSignal: (id) => { state.db.topics.signals = state.db.topics.signals.filter((x) => x.id !== id); scheduleSave('topics'); renderAll(); },
  signalToTopic: (id) => { const s = state.db.topics.signals.find((x) => x.id === id); s.handled = true; newTopic({ title: s.text.split('：').slice(1).join('：') || s.text, platform: '小红书', source: '热榜', status: '待评估' }); toast('信号已转为选题'); },
  calPrev: () => { const c = state.cal; c.m--; if (c.m < 0) { c.m = 11; c.y--; } renderView(); },
  calNext: () => { const c = state.cal; c.m++; if (c.m > 11) { c.m = 0; c.y++; } renderView(); },
  /* 图库 */
  galleryUpload: () => galleryUploadModal(),
  openLb: (id, el) => openLightbox(el.dataset.folder, +el.dataset.i),
  lbHold: () => {},
  closeLb: () => closeLightbox(),
  lbPrev: () => { const lb = state.lb; if (!lb) return; renderLb({ ...lb, i: (lb.i - 1 + lb.folder.images.length) % lb.folder.images.length }); },
  lbNext: () => { const lb = state.lb; if (!lb) return; renderLb({ ...lb, i: (lb.i + 1) % lb.folder.images.length }); },
  /* 提示词 */
  addPromptModal: () => promptModal(null),
  editPrompt: (id) => promptModal(state.db.prompts.items.find((x) => x.id === id)),
  toggleFav: (id) => { const p = state.db.prompts.items.find((x) => x.id === id); p.favorite = !p.favorite; scheduleSave('prompts'); renderAll(); },
  delPrompt: (id) => confirmDlg('删除这条提示词？', () => { state.db.prompts.items = state.db.prompts.items.filter((x) => x.id !== id); scheduleSave('prompts'); renderAll(); toast('提示词已删除'); }),
  copyPrompt: (id) => { const p = state.db.prompts.items.find((x) => x.id === id); copyText(p.body || p.title); },
  linkPrompt: (id) => linkModal(state.db.prompts.items.find((x) => x.id === id)),
  openPrompt: (id) => promptDetailModal(state.db.prompts.items.find((x) => x.id === id)),
  /* 网站 */
  addSiteModal: () => siteModal(null),
  editSite: (id) => siteModal(state.db.sites.items.find((x) => x.id === id)),
  delSite: (id) => confirmDlg('删除这个网站？', () => { state.db.sites.items = state.db.sites.items.filter((x) => x.id !== id); scheduleSave('sites'); renderAll(); toast('已删除'); }),
  /* 灵感 */
  openIdea: (id) => ideaModal(state.db.ideas.items.find((x) => x.id === id)),
  toggleIdea: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = !i.processed; scheduleSave('ideas'); renderAll(); closeModal(); toast(i.processed ? '已标记处理' : '已标回待处理'); },
  delIdea: (id) => { state.db.ideas.items = state.db.ideas.items.filter((x) => x.id !== id); scheduleSave('ideas'); renderAll(); closeModal(); toast('已删除'); },
  ideaToTask: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = true; newTask(i.text, '中', null, null); scheduleSave('ideas'); renderAll(); closeModal(); toast('已转为待办'); },
  ideaToTopic: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = true; scheduleSave('ideas'); newTopic({ title: i.text, platform: '小红书', source: '灵感', status: '待评估' }); closeModal(); toast('已转为选题（待评估）'); },
  ideaToPrompt: (id) => { const i = state.db.ideas.items.find((x) => x.id === id); i.processed = true; scheduleSave('ideas'); newPrompt({ type: '文生图', title: i.text }); closeModal(); toast('已在提示词库创建草稿'); },
};
function closeSide() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }

/* ---------- 设置 ---------- */
function settingsModal() {
  openModal({
    title: '设置',
    body: `<form id="settings-form"><div class="form-grid">
      <div class="field full"><label>数据服务地址（Cloudflare Worker）</label>
        <input class="input" name="api" value="${esc(state.apiBase)}" placeholder="https://nickwork-api.你的子域.workers.dev">
        <span class="hint">数据保存在 D1；浏览器只保存登录令牌和离线缓存。更换地址后需要重新输入访问密码。</span></div>
      <div class="field full"><label>图库仓库（owner/repo）</label>
        <input class="input" name="galleryRepo" value="${esc(state.galleryRepo)}" placeholder="YOUR_NAME/IMAGE_REPOSITORY"></div>
      <div class="field"><label>图库分支</label><input class="input" name="galleryBranch" value="${esc(state.galleryBranch)}" placeholder="main"></div>
      <div class="field"><label>图库根目录</label><input class="input" name="galleryRoot" value="${esc(state.galleryRoot)}" placeholder="images"></div>
      <div class="field"><label>上传子目录</label><input class="input" name="galleryFolder" value="${esc(state.galleryFolder)}" placeholder="uploads"></div>
      <div class="field full"><label>图库 GitHub Token</label>
        <div class="password-field"><input class="input" id="settings-gallery-token" name="galleryToken" type="password" value="${esc(state.galleryToken)}" placeholder="fine-grained Token，仅授予图库仓库 Contents 读写" autocomplete="off"><button class="password-toggle" type="button" data-act="togglePassword" data-target="settings-gallery-token" aria-label="显示密码">${ic('eye')}</button></div>
        <span class="hint">保存在本机浏览器，只需配置一次；不要把 Token 写进仓库。<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">创建 fine-grained Token</a></span></div>
      <div class="field full"><label>飞书同步地址（Cloudflare Worker）</label>
        <input class="input" name="feishu" value="${esc(state.feishuUrl)}" placeholder="https://你的-worker.workers.dev">
        <span class="hint">填好 Worker 后，选题中枢会出现「从飞书同步」按钮。Worker 部署方法见仓库 worker/ 目录的说明。</span></div>
      <div class="field full"><span class="hint">当前登录：${state.apiToken ? '当前标签页已登录，关闭标签页后需重新输入密码' : '未登录'}</span></div>
    </div></form>`,
    foot: `<button class="btn danger-ghost" id="st-clear" style="margin-right:auto">退出登录</button>
      <button class="btn ghost" id="st-test">测试连接</button>
      <button class="btn primary" type="submit" form="settings-form">保存</button>`,
  });
  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const nextBase = normalizeApiBase(f.api);
    const changed = nextBase !== normalizeApiBase(state.apiBase);
    setApiSession(nextBase, changed ? '' : state.apiToken);
    state.feishuUrl = (f.feishu || '').trim();
    state.feishuUrl ? localStorage.setItem('wb_feishu_url', state.feishuUrl) : localStorage.removeItem('wb_feishu_url');
    persistGalleryConfig(f);
    closeModal(); renderAll();
    if (!nextBase || changed) { showGate('数据服务地址已更新，请重新登录'); return; }
    try { await loadGalleryFromGitHub(true); renderView(); } catch (err) { toast('图库连接失败：' + err.message, 'err'); }
    toast('设置已保存');
  });
  $('#st-test').addEventListener('click', async () => {
    const f = Object.fromEntries(new FormData($('#settings-form')).entries());
    const base = normalizeApiBase(f.api);
    if (!base) { toast('先填写数据服务地址', 'err'); return; }
    if (base !== normalizeApiBase(state.apiBase)) { toast('先保存新地址并重新登录，再测试', 'err'); return; }
    if (!state.apiToken) { toast('当前未登录，不能读取云端数据', 'err'); return; }
    try {
      const j = await apiFetch('/data');
      const count = Object.keys((j && j.data) || {}).length;
      toast(`连接成功：云端有 ${count} 个数据集`);
    } catch (e) { toast('连接失败：' + e.message, 'err'); }
  });
  $('#st-clear').addEventListener('click', () => {
    clearApiToken();
    state.sync = 'local'; closeModal(); renderAll(); showGate('已退出登录');
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
  if (f.id === 'signal-add') {
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
  if (e.key === 'Escape') { closeModal(); closeSide(); closeLightbox(); }
  if (state.lb) {
    if (e.key === 'ArrowLeft') ACTIONS.lbPrev();
    if (e.key === 'ArrowRight') ACTIONS.lbNext();
  }
  const ideaBox = $('#idea-add textarea');
  if (ideaBox && document.activeElement === ideaBox && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault(); $('#idea-add').requestSubmit();
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
  const m = location.hash.match(/^#\/(\w+)(?:\/(.+))?/);
  if (m) { state.route = { mod: m[1], view: m[2] ? decodeURIComponent(m[2]) : routeFor(m[1]).view }; renderAll(); }
});

/* ---------- 侧边栏模块拖动排序 ---------- */
let dragMod = null;
document.addEventListener('dragstart', (e) => {
  const item = e.target.closest ? e.target.closest('.nav-item') : null;
  if (!item || !item.dataset.mod) return;
  dragMod = item.dataset.mod;
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', dragMod); } catch (err) {}
});
document.addEventListener('dragover', (e) => {
  if (!dragMod) return;
  const item = e.target.closest ? e.target.closest('.nav-item') : null;
  if (!item || item.dataset.mod === dragMod) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  $$('.nav-item').forEach((n) => n.classList.remove('drag-over'));
  item.classList.add('drag-over');
});
document.addEventListener('drop', (e) => {
  if (!dragMod) return;
  const item = e.target.closest ? e.target.closest('.nav-item') : null;
  if (!item || item.dataset.mod === dragMod) return;
  e.preventDefault();
  const target = item.dataset.mod;
  const order = state.modOrder.filter((m) => m !== dragMod);
  order.splice(order.indexOf(target), 0, dragMod);
  state.modOrder = order;
  localStorage.setItem('wb_mod_order', JSON.stringify(order));
  renderSidebar();
});
document.addEventListener('dragend', () => {
  dragMod = null;
  $$('.nav-item').forEach((n) => n.classList.remove('dragging', 'drag-over'));
});

/* ---------- 启动 ---------- */
async function start() {
  renderAll();
  await loadAll();
  const m = location.hash.match(/^#\/(\w+)(?:\/(.+))?/);
  if (m) state.route = { mod: m[1], view: m[2] ? decodeURIComponent(m[2]) : routeFor(m[1]).view };
  else state.route = routeFor(state.modOrder[0]);
  renderAll();
}
(async function boot() {
  localStorage.removeItem('wb_token');
  localStorage.removeItem('wb_api_token');
  if (state.apiBase && state.apiToken) return start();
  showGate();
})();
function showGate(message = '') {
  const old = $('#gate-root');
  if (old) old.remove();
  const root = document.createElement('div');
  root.id = 'gate-root';
  root.innerHTML = `<div class="gate">
    <form class="gate-card" id="gate-form">
      <div class="gate-mark" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><rect x="5" y="9" width="38" height="9" rx="4.5" fill="currentColor"/><rect x="5" y="20" width="30" height="9" rx="4.5" fill="currentColor" opacity=".55"/><rect x="5" y="31" width="38" height="9" rx="4.5" fill="currentColor" opacity=".28"/></svg></div>
      <div class="gate-title">NickWork</div>
      <div class="gate-sub">${esc(message || '私有工作台 · 连接云端数据')}</div>
      <div class="password-field"><input class="input" id="gate-pass" type="password" placeholder="访问密码" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text"><button class="password-toggle" type="button" data-act="togglePassword" data-target="gate-pass" aria-label="显示密码">${ic('eye')}</button></div>
      <button class="btn ghost gate-cf" id="gate-cf-toggle" type="button" aria-expanded="false">${ic('globe')}<span>Cloudflare 设置</span></button>
      <div class="gate-api-field" id="gate-api-field" hidden>
        <input class="input" id="gate-api" type="url" value="${esc(state.apiBase)}" placeholder="数据服务地址 https://xxx.workers.dev" autocomplete="url">
      </div>
      <button class="btn primary" type="submit" style="width:100%;justify-content:center">进入</button>
      <div class="gate-err" id="gate-err"></div>
    </form>
  </div>`;
  document.body.appendChild(root);
  $('#gate-pass').focus();
  $('#gate-cf-toggle').addEventListener('click', () => {
    const field = $('#gate-api-field');
    const button = $('#gate-cf-toggle');
    field.hidden = !field.hidden;
    button.setAttribute('aria-expanded', String(!field.hidden));
    button.classList.toggle('active', !field.hidden);
    button.innerHTML = `${ic('globe')}<span>${field.hidden ? 'Cloudflare 设置' : '收起设置'}</span>`;
    if (!field.hidden) $('#gate-api').focus();
  });
  $('#gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = normalizeApiBase($('#gate-api').value);
    const pass = $('#gate-pass').value.trim();
    const button = $('#gate-form button[type="submit"]');
    if (!base || !pass) {
      $('#gate-err').textContent = '请填写数据服务地址和访问密码';
      return;
    }
    button.disabled = true;
    $('#gate-err').textContent = '连接中…';
    try {
      const res = await fetch(base + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass }),
        cache: 'no-store',
      });
      const text = await res.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch (err) {}
      if (!res.ok || !payload || !payload.token) {
        const err = new Error((payload && payload.error) || (res.status === 401 ? '密码不对，再试试' : `服务请求失败（${res.status}）`));
        err.status = res.status;
        throw err;
      }
      setApiSession(base, payload.token);
      root.remove();
      start();
    } catch (err) {
      $('#gate-err').textContent = err.status === 401 ? '密码不对，再试试' : ('连接失败：' + err.message);
      $('#gate-pass').value = '';
      $('#gate-pass').focus();
      const card = root.querySelector('.gate-card');
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    } finally {
      button.disabled = false;
    }
  });
}
