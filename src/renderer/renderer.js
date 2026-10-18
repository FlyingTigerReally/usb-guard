/* 渲染进程逻辑（含界面国际化） */
const api = window.usbGuard;

// ============ 内置 i18n（语言包经 IPC 同步，见 loadI18n） ============
let i18nPack = {};
let locale = 'en';
let localeOptions = [];

function t(key, params) {
  let str = i18nPack[key];
  if (str === undefined) return key;
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      params[name] !== undefined ? String(params[name]) : m
    );
  }
  return str;
}

// 通过脚本注入式 fetch 无法满足 CSP，故改由 IPC 拉取语言包
async function loadI18n(code) {
  const res = await api.getI18n(code);
  i18nPack = res.pack;
  locale = res.locale;
  localeOptions = res.options;
  document.documentElement.lang = locale;
  applyStaticI18n();
}

function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
}

let state = {
  drives: [],
  events: [],
  settings: {},
};
let currentDriveId = null;

// ============ 工具函数 ============
// 按钮忙碌态：禁用 + 转圈 + 换文案，既防重复点击，也让用户知道操作在执行中。
// 返回 false 表示按钮已在忙碌中，调用方应直接放弃本次点击。
function setBtnBusy(btn, busyKey) {
  if (btn.disabled) return false;
  btn.disabled = true;
  btn.classList.add('is-loading');
  btn.textContent = t(busyKey);
  return true;
}

function setBtnIdle(btn, idleKey) {
  btn.disabled = false;
  btn.classList.remove('is-loading');
  btn.textContent = t(idleKey);
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function driveTypeLabel(t2) {
  const map = {
    0: 'driveType.unknown',
    2: 'driveType.removable',
    3: 'driveType.fixed',
    4: 'driveType.network',
    5: 'driveType.cd',
  };
  return t(map[t2] || 'driveType.unknown');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// 事件分类 → 样式（英文枚举判断，不用中文）
function eventClass(evt) {
  if (evt.ok === 0) return 'err';
  if (evt.status === 'drive_removed' || evt.status === 'kill_dispatched') return 'info';
  return 'ok';
}

// 事件文案：按 status 映射 i18n key（英文状态判断）
function eventMessage(evt) {
  return t(`evt.${evt.status}`, evt.params || {});
}

// ============ 渲染：语言选择器 ============
function renderLangSelect() {
  const sel = document.getElementById('langSelect');
  sel.innerHTML = localeOptions.map((o) => {
    const label = locale === 'zh-CN' ? o.labelZh : o.labelEn;
    return `<option value="${escapeHtml(o.code)}" ${o.code === locale ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

// ============ 渲染：驱动器列表 ============
function renderDrives() {
  const box = document.getElementById('driveList');
  if (state.drives.length === 0) {
    box.innerHTML = `<div class="empty">${escapeHtml(t('empty.noDrives'))}</div>`;
    return;
  }
  box.innerHTML = state.drives.map((d) => {
    const on = d.enabled === 1;
    const tag = d.isSystem === 1
      ? `<span class="badge badge-gray">${escapeHtml(t('drive.systemDisk'))}</span>`
      : (on
        ? `<span class="badge badge-green">${escapeHtml(t('drive.guarding'))}</span>`
        : `<span class="badge badge-gray">${escapeHtml(t('drive.notGuarding'))}</span>`);
    const meta = t('drive.meta', {
      id: d.id,
      type: driveTypeLabel(d.driveType),
      size: fmtSize(d.size),
      count: d.processCount,
    });
    return `
      <div class="drive-card" data-drive="${escapeHtml(d.id)}">
        <div class="drive-icon">${escapeHtml(d.id)}</div>
        <div class="drive-meta">
          <div class="title">
            <span>${escapeHtml(d.label || t('drive.noLabel'))}</span>
            ${tag}
          </div>
          <div class="sub">${escapeHtml(meta)}</div>
        </div>
        <button class="btn btn-ghost btn-detail" data-drive="${escapeHtml(d.id)}">${escapeHtml(t('btn.detail'))}</button>
        <label class="switch">
          <input type="checkbox" class="guard-toggle" data-drive="${escapeHtml(d.id)}"
                 ${on ? 'checked' : ''} ${d.isSystem === 1 ? 'disabled' : ''} />
          <span class="slider"></span>
        </label>
      </div>`;
  }).join('');

  box.querySelectorAll('.guard-toggle').forEach((el) => {
    el.addEventListener('change', async (e) => {
      const driveId = e.target.dataset.drive;
      const enabled = e.target.checked ? 1 : 0;
      state.drives = await api.setGuard(driveId, enabled);
      renderDrives();
    });
  });
  box.querySelectorAll('.btn-detail').forEach((el) => {
    el.addEventListener('click', async (e) => {
      const driveId = e.target.dataset.drive;
      openDrawer(driveId);
      // 按需即时扫描：打开进程详情时立即刷新一次快照，不必等周期轮询（默认 5s）。
      // 故意不放进 openDrawer()：切语言等场景会复用 openDrawer 重渲染，不应触发扫描。
      state.drives = await api.refresh();
      renderDrives();
      if (currentDriveId === driveId) renderDrawerBody();
    });
  });
}

// ============ 渲染：事件日志 ============
// 性能约定：DOM 里最多只保留 MAX_DOM_EVENTS 个节点，内存中最多 MAX_EVENT_LOG 条。
// 新事件用增量插入（insertAdjacentHTML）而非整表 innerHTML 重建，避免长时间运行后
// 每条事件都重建数百个节点造成 DOM 抖动、GC 压力与滚动位置跳动。
const MAX_EVENT_LOG = 500; // 内存环形上限
const MAX_DOM_EVENTS = 100; // DOM 渲染上限

function eventNodeHtml(e) {
  return `
    <div class="event-item ${eventClass(e)}">
      <div class="time">${fmtTime(e.timestamp)}</div>
      <div class="msg">${escapeHtml(eventMessage(e))}</div>
      <div class="status-tag">${escapeHtml(e.status)}</div>
    </div>`;
}

function renderEvents() {
  const box = document.getElementById('eventList');
  document.getElementById('eventCount').textContent = t('panel.eventsCount', {
    count: state.events.length,
  });
  if (state.events.length === 0) {
    box.innerHTML = `<div class="empty">${escapeHtml(t('empty.noEvents'))}</div>`;
    return;
  }
  // 只渲染最近 MAX_DOM_EVENTS 条，超出部分留在内存数组里不进 DOM
  box.innerHTML = state.events
    .slice(0, MAX_DOM_EVENTS)
    .map(eventNodeHtml)
    .join('');
}

function pushEvent(evt) {
  state.events.unshift(evt);
  if (state.events.length > MAX_EVENT_LOG) state.events.length = MAX_EVENT_LOG;

  const box = document.getElementById('eventList');
  const first = box.firstElementChild;
  // 空状态节点存在时需要整表切换，否则直接增量插入
  if (!first || first.classList.contains('empty')) {
    renderEvents();
    return;
  }
  box.insertAdjacentHTML('afterbegin', eventNodeHtml(evt));
  // 移除超出 DOM 上限的尾部节点
  while (box.children.length > MAX_DOM_EVENTS) {
    box.removeChild(box.lastElementChild);
  }
  // 只更新计数，不动 DOM
  document.getElementById('eventCount').textContent = t('panel.eventsCount', {
    count: state.events.length,
  });
}

// ============ 渲染：设置 ============
function renderSettings() {
  const s = state.settings;
  document.getElementById('setKillChildren').checked = s.killChildren === 1;
  document.getElementById('setAutoGuard').checked = s.autoGuardRemovable === 1;
  document.getElementById('setMinimizeToTray').checked = s.minimizeToTray === 1;
  document.getElementById('setAutoLaunch').checked = s.autoLaunch === 1;
}

function bindSettings() {
  const bind = (id, key) => {
    document.getElementById(id).addEventListener('change', async (e) => {
      state.settings = await api.updateSettings({ [key]: e.target.checked ? 1 : 0 });
    });
  };
  bind('setKillChildren', 'killChildren');
  bind('setAutoGuard', 'autoGuardRemovable');
  bind('setMinimizeToTray', 'minimizeToTray');
  bind('setAutoLaunch', 'autoLaunch');
}

// ============ 明细抽屉 ============
function openDrawer(driveId) {
  currentDriveId = driveId;
  const drive = state.drives.find((d) => d.id === driveId);
  const label = drive && drive.label ? ` (${drive.label})` : '';
  document.getElementById('drawerTitle').textContent =
    `${t('panel.processDetail')} · ${driveId}${label}`;
  document.getElementById('detailDrawer').classList.remove('hidden');
  renderDrawerBody();
}

function renderDrawerBody() {
  const body = document.getElementById('drawerBody');
  const drive = state.drives.find((d) => d.id === currentDriveId);
  const procs = (drive && drive.processList) || [];
  if (procs.length === 0) {
    body.innerHTML = `<div class="empty">${escapeHtml(t('empty.noProcesses'))}</div>`;
    return;
  }
  body.innerHTML = procs.map((p) => `
    <div class="proc-row">
      <div>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="path" title="${escapeHtml(p.exePath)}">${escapeHtml(p.exePath)}</div>
      </div>
      <div class="pid">${escapeHtml(t('proc.pid', { pid: p.pid }))}</div>
    </div>`).join('');
}

function closeDrawer() {
  currentDriveId = null;
  document.getElementById('detailDrawer').classList.add('hidden');
}

// 切换语言：主进程重建菜单/托盘，渲染层重新渲染全部文案
async function switchLocale(code) {
  await api.setLocale(code);
  await loadI18n(code);
  renderLangSelect();
  renderDrives();
  renderEvents();
  if (currentDriveId) openDrawer(currentDriveId);
}

// ============ 初始化 ============
async function init() {
  // 关键：先注册事件监听，再取初始状态。
  // 主进程 guard.start() 的驱动器扫描是异步的（PowerShell 2~5s），启动初期的
  // drive_connected 事件若早于监听器注册会丢失，导致界面必须手动刷新才显示盘。
  // 先订阅可确保这些事件被捕捉到并触发补渲染。
  api.onEvent((evt) => {
    pushEvent(evt);
    // 会影响驱动器列表/进程计数的事件：重新拉取状态并渲染（防抖合并）
    if (DRIVE_AFFECTING_EVENTS.has(evt.status)) {
      scheduleStateRefresh();
    }
  });

  const s = await api.getState();
  state = { ...state, ...s };

  await loadI18n(s.locale || 'en');
  await refreshDriveProcesses();

  renderLangSelect();
  renderDrives();
  renderEvents();
  renderSettings();
  bindSettings();

  document.getElementById('langSelect').addEventListener('change', (e) => {
    switchLocale(e.target.value);
  });

  document.getElementById('btnRefresh').addEventListener('click', async () => {
    const btn = document.getElementById('btnRefresh');
    if (!setBtnBusy(btn, 'btn.refreshing')) return;
    try {
      state.drives = await api.refresh();
      await refreshDriveProcesses();
      renderDrives();
    } finally {
      setBtnIdle(btn, 'btn.refresh');
    }
  });
  document.getElementById('drawerClose').addEventListener('click', closeDrawer);
  document.getElementById('btnKillAll').addEventListener('click', async () => {
    if (!currentDriveId) return;
    const btn = document.getElementById('btnKillAll');
    if (!setBtnBusy(btn, 'btn.killing')) return;
    try {
      await api.killAll(currentDriveId);
      state.drives = await api.refresh();
      await refreshDriveProcesses();
      renderDrives();
      renderDrawerBody();
    } finally {
      setBtnIdle(btn, 'btn.killAll');
    }
  });
}

// 会改变驱动器列表或进程计数的事件状态（英文枚举）
const DRIVE_AFFECTING_EVENTS = new Set([
  'drive_connected',    // 新盘接入（启动扫描完成时也会触发，用于补渲染启动竞态）
  'drive_removed',      // 盘拔出
  'guard_enabled',      // 守护开关变化
  'guard_disabled',
  'snapshot_updated',   // 进程快照变化
  'kill_dispatched',    // 进程被批量关闭
  'process_killed',
  'process_kill_failed',
]);

async function refreshDriveProcesses() {
  const s = await api.getState();
  state.drives = s.drives;
  state.events = s.events;
}

// 防抖刷新：短时间连续多条事件只做一次 IPC + 渲染，避免频繁全量拉取
let stateRefreshTimer = null;
function scheduleStateRefresh() {
  if (stateRefreshTimer) clearTimeout(stateRefreshTimer);
  stateRefreshTimer = setTimeout(() => {
    stateRefreshTimer = null;
    refreshDriveProcesses().then(() => {
      renderDrives();
      renderEvents();
      if (currentDriveId) renderDrawerBody();
    });
  }, 250);
}

init();
