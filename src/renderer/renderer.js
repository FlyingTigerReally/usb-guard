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

// ============ 主题（跟随系统 / 浅色 / 深色） ============
const THEME_OPTIONS = ['system', 'light', 'dark'];
const systemLightMq = window.matchMedia('(prefers-color-scheme: light)');

// system 模式解析成具体主题写入 html[data-theme]，CSS 只维护一套浅色 token
function applyTheme(mode) {
  const resolved = mode === 'system' ? (systemLightMq.matches ? 'light' : 'dark') : mode;
  document.documentElement.dataset.theme = resolved;
}

function renderThemeSelect() {
  const sel = document.getElementById('themeSelect');
  const current = state.settings.theme || 'system';
  sel.innerHTML = THEME_OPTIONS.map((o) =>
    `<option value="${o}" ${o === current ? 'selected' : ''}>${escapeHtml(t('theme.' + o))}</option>`
  ).join('');
}

// ============ 渲染：仪表读数 ============
// 守护中的盘 / 已追踪进程 / 事件数，随列表与日志渲染联动刷新
function updateReadout() {
  const guarded = state.drives.filter((d) => d.enabled === 1).length;
  const procs = state.drives.reduce((n, d) => n + (d.processCount || 0), 0);
  document.getElementById('statGuarded').textContent = String(guarded);
  document.getElementById('statProcesses').textContent = String(procs);
  document.getElementById('statEvents').textContent = String(state.events.length);
}

// ============ 渲染：驱动器列表 ============
// 动效原则：只对"真正变化"的对象播放动画（新卡入场、开关点亮），
// 整表重建的老卡片保持静止——既有动效反馈，又不会刷新闪烁。
let prevDriveIds = null;   // 上次渲染的盘符集合（识别新卡）
let justToggledId = null;  // 守护开关刚切换的盘（一次性点亮标记）

function renderDrives() {
  const box = document.getElementById('driveList');
  const prevScroll = box.scrollTop; // 整表重建后恢复滚动位置，避免视觉跳动
  if (state.drives.length === 0) {
    box.innerHTML = `<div class="empty">${escapeHtml(t('empty.noDrives'))}</div>`;
    updateReadout();
    return;
  }
  box.innerHTML = state.drives.map((d) => {
    const on = d.enabled === 1;
    const isNew = prevDriveIds !== null && !prevDriveIds.has(d.id);
    const toggled = justToggledId === d.id;
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
      <div class="drive-card${on ? ' guarded' : ''}${isNew ? ' is-new' : ''}${toggled ? ' just-toggled' : ''}" data-drive="${escapeHtml(d.id)}">
        <div class="drive-plate">${escapeHtml(d.id)}</div>
        <div class="drive-meta">
          <div class="title">
            <span>${escapeHtml(d.label || t('drive.noLabel'))}</span>
            ${tag}
          </div>
          <div class="sub">${escapeHtml(meta)}</div>
        </div>
        <div class="drive-actions">
          <button class="btn btn-ghost btn-detail" data-drive="${escapeHtml(d.id)}">${escapeHtml(t('btn.detail'))}</button>
          <label class="switch">
            <input type="checkbox" class="guard-toggle" data-drive="${escapeHtml(d.id)}"
                   ${on ? 'checked' : ''} ${d.isSystem === 1 ? 'disabled' : ''} />
            <span class="slider"></span>
          </label>
        </div>
      </div>`;
  }).join('');

  box.querySelectorAll('.guard-toggle').forEach((el) => {
    el.addEventListener('change', async (e) => {
      const driveId = e.target.dataset.drive;
      const enabled = e.target.checked ? 1 : 0;
      state.drives = await api.setGuard(driveId, enabled);
      justToggledId = driveId; // 触发一次性"指示条点亮"动画
      renderDrives();
    });
  });
  box.querySelectorAll('.btn-detail').forEach((el) => {
    bindMagnetic(el);
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
  box.scrollTop = prevScroll;
  prevDriveIds = new Set(state.drives.map((d) => d.id));
  justToggledId = null; // 点亮标记一次性消费
  updateReadout();
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
  const prevScroll = box.scrollTop; // 整表重建后恢复滚动位置，避免视觉跳动
  document.getElementById('eventCount').textContent = t('panel.eventsCount', {
    count: state.events.length,
  });
  if (state.events.length === 0) {
    box.innerHTML = `<div class="empty">${escapeHtml(t('empty.noEvents'))}</div>`;
    updateReadout();
    return;
  }
  // 只渲染最近 MAX_DOM_EVENTS 条，超出部分留在内存数组里不进 DOM
  box.innerHTML = state.events
    .slice(0, MAX_DOM_EVENTS)
    .map(eventNodeHtml)
    .join('');
  box.scrollTop = prevScroll;
  updateReadout();
}

// 关键业务事件 → 派发给 3D 场景打脉冲（scene3d.js 监听）
const PULSE_EVENTS = new Set([
  'drive_connected', 'drive_removed', 'guard_enabled', 'guard_disabled',
  'kill_dispatched', 'process_killed',
]);

function pushEvent(evt) {
  state.events.unshift(evt);
  if (state.events.length > MAX_EVENT_LOG) state.events.length = MAX_EVENT_LOG;
  if (PULSE_EVENTS.has(evt.status)) {
    window.dispatchEvent(new CustomEvent('usbguard-evt', { detail: evt }));
  }

  const box = document.getElementById('eventList');
  const first = box.firstElementChild;
  // 空状态节点存在时需要整表切换，否则直接增量插入
  if (!first || first.classList.contains('empty')) {
    renderEvents();
    return;
  }
  box.insertAdjacentHTML('afterbegin', eventNodeHtml(evt));
  // 标记新行：只有增量插入的行播入场动画（is-new），整表重建不重播
  box.firstElementChild.classList.add('is-new');
  // 移除超出 DOM 上限的尾部节点
  while (box.children.length > MAX_DOM_EVENTS) {
    box.removeChild(box.lastElementChild);
  }
  // 只更新计数，不动 DOM
  document.getElementById('eventCount').textContent = t('panel.eventsCount', {
    count: state.events.length,
  });
  updateReadout();
}

// ============ 渲染：设置 ============
function renderSettings() {
  const s = state.settings;
  document.getElementById('setKillChildren').checked = s.killChildren === 1;
  document.getElementById('setAutoGuard').checked = s.autoGuardRemovable === 1;
  document.getElementById('setMinimizeToTray').checked = s.minimizeToTray === 1;
  document.getElementById('setAutoLaunch').checked = s.autoLaunch === 1;
  renderSceneSelect();
}

// 3D 背景样式选择（core / nebula / off）
function renderSceneSelect() {
  const sel = document.getElementById('sceneSelect');
  const current = state.settings.scene3d || 'core';
  sel.innerHTML = ['core', 'nebula', 'off'].map((o) =>
    `<option value="${o}" ${o === current ? 'selected' : ''}>${escapeHtml(t('scene.' + o))}</option>`
  ).join('');
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

  // 3D 背景切换：持久化 + 通知场景层。
  // 初始值同时经 data-scene3d（scene3d.js 启动时读取）与事件（运行时切换）双通道传递，
  // 避免 classic script 与 module 加载时序竞态。
  document.getElementById('sceneSelect').addEventListener('change', async (e) => {
    const next = e.target.value;
    state.settings = await api.updateSettings({ scene3d: next });
    document.documentElement.dataset.scene3d = next;
    window.dispatchEvent(new CustomEvent('usbguard-scene', { detail: next }));
  });
  const initial = state.settings.scene3d || 'core';
  document.documentElement.dataset.scene3d = initial;
  window.dispatchEvent(new CustomEvent('usbguard-scene', { detail: initial }));
}

// ============ 动效（GSAP） ============
// 全部动效走 GSAP 编排：统一节奏/缓动/层次，gsap 未加载时界面功能不受影响。

// 文本拆分：标题逐字符进入（自实现 split，避免额外插件依赖）
function splitChars(el) {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = [...text]
    .map((c) => `<span class="char">${c === ' ' ? '&nbsp;' : escapeHtml(c)}</span>`)
    .join('');
  return el.querySelectorAll('.char');
}

// 磁吸悬停：鼠标在按钮内移动产生惯性微位移，移出归位
function bindMagnetic(el) {
  if (!window.gsap || el.dataset.magnetic) return;
  el.dataset.magnetic = '1';
  const xTo = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' });
  el.addEventListener('mousemove', (e) => {
    // 入场动画期间不响应磁吸：quickTo 会与入场 tween 争抢 transform 导致按钮脱位
    if (document.body.classList.contains('is-entering')) return;
    const r = el.getBoundingClientRect();
    xTo((e.clientX - r.left - r.width / 2) * 0.22);
    yTo((e.clientY - r.top - r.height / 2) * 0.32);
  });
  el.addEventListener('mouseleave', () => {
    xTo(0);
    yTo(0);
  });
}

// 入场编排：品牌（逐字符）→ 读数带（数字滚动）→ 面板 → 列表行，层层递进
function playEntrance() {
  if (!window.gsap) return;
  const chars = splitChars(document.querySelector('.brand h1'));
  document.body.classList.add('is-entering');

  // 读数数字滚动：0 → 当前值
  const countTargets = ['statGuarded', 'statProcesses', 'statEvents'].map((id) => {
    const el = document.getElementById(id);
    return { el, val: parseInt(el.textContent, 10) || 0 };
  });

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => {
      document.body.classList.remove('is-entering');
      // 入场数字滚动可能与实时数据到达竞争，结束后强制回写真实值
      updateReadout();
    },
  });
  // 快速入场（~1s 内完成）：绝对时间点布局，各段大幅并行，微 stagger 保留层次
  tl.fromTo('#hero3d', { opacity: 0 }, { opacity: 1, duration: 0.7, ease: 'power2.out', clearProps: 'opacity' }, 0)
    .from(chars, { yPercent: 118, opacity: 0, stagger: 0.012, duration: 0.3 }, 0)
    .from('.brand p', { y: 8, opacity: 0, duration: 0.25 }, 0.15)
    .from('.top-actions > *', { y: 10, opacity: 0, stagger: 0.03, duration: 0.25, clearProps: 'transform,opacity' }, 0.2)
    .from('.readout-item', { y: 20, opacity: 0, stagger: 0.04, duration: 0.3 }, 0.25)
    .from('.readout-live', { opacity: 0, duration: 0.25 }, 0.4);

  // 数字滚动并行播放
  countTargets.forEach(({ el }) => {
    const obj = { v: 0 };
    tl.to(obj, {
      v: 1,
      duration: 0.4,
      ease: 'power2.out',
      // 动画真正开始时才取目标值，避免用入场瞬间的旧值（如 0）覆盖稍后到达的数据
      onStart: () => {
        obj.target = parseInt(el.textContent, 10) || 0;
      },
      onUpdate: () => { el.textContent = String(Math.round(obj.v * obj.target)); },
    }, 0.3); // 三个数字同时滚动
  });

  tl.from('.panel', { y: 24, opacity: 0, stagger: 0.05, duration: 0.32 }, 0.48);
  if (document.querySelector('.drive-card')) {
    tl.from('.drive-card', { y: 10, opacity: 0, stagger: 0.02, duration: 0.25 }, 0.6);
  }
  if (document.querySelector('.event-item')) {
    tl.from('.event-item', { x: 14, opacity: 0, stagger: 0.008, duration: 0.2 }, 0.64);
  }
}

// ============ 明细抽屉 ============
function openDrawer(driveId) {
  currentDriveId = driveId;
  const drive = state.drives.find((d) => d.id === driveId);
  const label = drive && drive.label ? ` (${drive.label})` : '';
  document.getElementById('drawerTitle').textContent =
    `${t('panel.processDetail')} · ${driveId}${label}`;
  const drawer = document.getElementById('detailDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  drawer.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  renderDrawerBody();
  // 焦点移入抽屉，键盘用户可直接操作（Esc 关闭）
  document.getElementById('drawerClose').focus();
  // GSAP 模块切换过渡：遮罩淡入 + 面板滑入 + 进程行依次就位
  if (window.gsap) {
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power2.out' });
    gsap.fromTo(drawer, { x: 44, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, ease: 'power3.out' });
    gsap.fromTo('.proc-row', { y: 12, opacity: 0 }, {
      y: 0, opacity: 1, stagger: 0.05, duration: 0.35, ease: 'power2.out', delay: 0.12,
    });
  }
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
  const drawer = document.getElementById('detailDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  // GSAP 退出过渡：滑出 + 淡出后再隐藏，避免生硬消失
  if (window.gsap) {
    gsap.to(backdrop, { opacity: 0, duration: 0.2, ease: 'power2.in' });
    gsap.to(drawer, {
      x: 32, opacity: 0, duration: 0.24, ease: 'power2.in',
      onComplete: () => {
        drawer.classList.add('hidden');
        backdrop.classList.add('hidden');
        gsap.set([drawer, backdrop], { clearProps: 'transform,opacity' });
      },
    });
    return;
  }
  drawer.classList.add('hidden');
  backdrop.classList.add('hidden');
}

// ============ 设置弹窗 ============
let settingsOpen = false;

function openSettings() {
  if (settingsOpen) return;
  settingsOpen = true;
  const dialog = document.getElementById('settingsDialog');
  const backdrop = document.getElementById('settingsBackdrop');
  dialog.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  renderSettings();
  document.getElementById('settingsClose').focus();
  // GSAP 过渡：遮罩淡入 + 弹窗上浮 + 设置项依次就位
  // 注意：不用 scale 动画——纹理缩放会让文字发虚；结束清掉 transform 防残留
  if (window.gsap) {
    gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' });
    gsap.fromTo(dialog, { y: 18, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.35, ease: 'power3.out', clearProps: 'transform,opacity',
    });
    gsap.fromTo('.dialog .setting-row', { y: 10, opacity: 0 }, {
      y: 0, opacity: 1, stagger: 0.05, duration: 0.3, ease: 'power2.out', delay: 0.08, clearProps: 'transform,opacity',
    });
  }
}

function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  const dialog = document.getElementById('settingsDialog');
  const backdrop = document.getElementById('settingsBackdrop');
  const done = () => {
    dialog.classList.add('hidden');
    backdrop.classList.add('hidden');
    if (window.gsap) gsap.set([dialog, backdrop], { clearProps: 'transform,opacity' });
    document.getElementById('btnSettings').focus();
  };
  if (window.gsap) {
    gsap.to(backdrop, { opacity: 0, duration: 0.18, ease: 'power2.in' });
    gsap.to(dialog, { y: 12, opacity: 0, duration: 0.22, ease: 'power2.in', onComplete: done });
    return;
  }
  done();
}

// 切换语言：主进程重建菜单/托盘，渲染层重新渲染全部文案
async function switchLocale(code) {
  await api.setLocale(code);
  await loadI18n(code);
  renderLangSelect();
  renderThemeSelect();
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

  renderLangSelect();
  renderDrives();
  renderEvents();
  renderSettings();
  bindSettings();

  // 主题：按持久化设置应用，system 模式实时跟随系统变化
  applyTheme(state.settings.theme || 'system');
  renderThemeSelect();
  document.getElementById('themeSelect').addEventListener('change', async (e) => {
    state.settings = await api.updateSettings({ theme: e.target.value });
    applyTheme(e.target.value);
    renderThemeSelect();
  });
  systemLightMq.addEventListener('change', () => {
    if ((state.settings.theme || 'system') === 'system') applyTheme('system');
  });

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
  // 遮罩点击 / Esc 关闭抽屉
  document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    // Esc 优先关闭最上层：设置弹窗 → 进程抽屉
    if (settingsOpen) { closeSettings(); return; }
    if (currentDriveId) closeDrawer();
  });

  // 设置弹窗
  document.getElementById('btnSettings').addEventListener('click', openSettings);
  document.getElementById('settingsClose').addEventListener('click', closeSettings);
  document.getElementById('settingsBackdrop').addEventListener('click', closeSettings);
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

  // ScrollTrigger：事件日志滚动 → 顶部进度条（滚动驱动的 DOM 动画）
  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.create({
      scroller: '#eventList',
      trigger: '#eventList',
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        const bar = document.getElementById('scrollProgress');
        if (bar) bar.style.width = `${(self.progress * 100).toFixed(1)}%`;
      },
    });
  }

  // 磁吸悬停（静态按钮；卡片内的明细按钮在 renderDrives 里绑定）
  ['btnRefresh', 'btnSettings', 'btnKillAll', 'drawerClose', 'settingsClose'].forEach((id) => {
    bindMagnetic(document.getElementById(id));
  });

  // 入场编排
  playEntrance();
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
