/* 渲染进程逻辑（含界面国际化） */
const api = window.usbGuard;

// ============ 内置 i18n（语言包经 IPC 同步，见 loadI18n） ============
let i18nPack = {};
let locale = "en";
let localeOptions = [];

function t(key, params) {
  let str = i18nPack[key];
  if (str === undefined) return key;
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (m, name) =>
      params[name] !== undefined ? String(params[name]) : m,
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
  document
    .querySelectorAll("[data-i18n-placeholder]")
    .forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
    el.setAttribute("aria-label", el.title);
  });
}

let state = {
  drives: [],
  events: [],
  settings: {},
};
let currentDriveId = null;
let driveFilter = "all";
let errorsOnly = false;
let motionPaused = false;
let logOpen = false;
let logQuery = "";

// ============ 工具函数 ============
// 按钮忙碌态：禁用 + 转圈 + 换文案，既防重复点击，也让用户知道操作在执行中。
// 返回 false 表示按钮已在忙碌中，调用方应直接放弃本次点击。
function setBtnBusy(btn, busyKey) {
  if (btn.disabled) return false;
  btn.disabled = true;
  btn.classList.add("is-loading");
  btn.textContent = t(busyKey);
  return true;
}

function setBtnIdle(btn, idleKey) {
  btn.disabled = false;
  btn.classList.remove("is-loading");
  btn.textContent = t(idleKey);
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function driveTypeLabel(t2) {
  const map = {
    0: "driveType.unknown",
    2: "driveType.removable",
    3: "driveType.fixed",
    4: "driveType.network",
    5: "driveType.cd",
  };
  return t(map[t2] || "driveType.unknown");
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

// 事件分类 → 样式（英文枚举判断，不用中文）
function eventClass(evt) {
  if (evt.ok === 0) return "err";
  if (evt.status === "drive_removed" || evt.status === "kill_dispatched")
    return "info";
  return "ok";
}

// 事件文案：按 status 映射 i18n key（英文状态判断）
function eventMessage(evt) {
  return t(`evt.${evt.status}`, evt.params || {});
}

// ============ 渲染：语言选择器 ============
function renderLangSelect() {
  const sel = document.getElementById("langSelect");
  sel.innerHTML = localeOptions
    .map((o) => {
      const label = locale === "zh-CN" ? o.labelZh : o.labelEn;
      return `<option value="${escapeHtml(o.code)}" ${o.code === locale ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

// ============ 主题（跟随系统 / 浅色 / 深色） ============
const THEME_OPTIONS = ["system", "light", "dark"];
const systemLightMq = window.matchMedia("(prefers-color-scheme: light)");

// system 模式解析成具体主题写入 html[data-theme]，CSS 只维护一套浅色 token
function applyTheme(mode) {
  const resolved =
    mode === "system" ? (systemLightMq.matches ? "light" : "dark") : mode;
  document.documentElement.dataset.theme = resolved;
}

function renderThemeSelect() {
  const sel = document.getElementById("themeSelect");
  const current = state.settings.theme || "system";
  sel.innerHTML = THEME_OPTIONS.map(
    (o) =>
      `<option value="${o}" ${o === current ? "selected" : ""}>${escapeHtml(t("theme." + o))}</option>`,
  ).join("");
}

// ============ 渲染：仪表读数 ============
// 守护中的盘 / 已追踪进程 / 事件数，随列表与日志渲染联动刷新
function updateReadout() {
  const guarded = state.drives.filter((d) => d.enabled === 1).length;
  document.getElementById("logBadge").textContent = String(state.events.length);
  document.getElementById("awardGuarded").innerHTML =
    guarded + "<small>DRIVES</small>";
  document.getElementById("awardClosed").innerHTML =
    state.events.filter((e) => e.status === "process_killed" && e.ok !== 0)
      .length + "<small>PROCESSES</small>";
  const procs = state.drives.reduce((n, d) => n + (d.processCount || 0), 0);
  document.getElementById("statGuarded").textContent = String(guarded);
  document.getElementById("statProcesses").textContent = String(procs);
  document.getElementById("statEvents").textContent = String(
    state.events.length,
  );
  document.getElementById("driveCount").textContent = String(
    state.drives.length,
  );
  const lastHealthEvent = state.events.find((e) =>
    [
      "watch_error",
      "watch_start_failed",
      "snapshot_updated",
      "drive_connected",
    ].includes(e.status),
  );
  const key =
    lastHealthEvent?.ok === 0
      ? "stat.watchError"
      : state.drives.length
        ? "stat.watching"
        : "stat.waiting";
  document.getElementById("watchStatus").textContent = t(key);
  document.getElementById("heroStatus").textContent = t(
    guarded ? "hero.protecting" : "hero.ready",
  );
}

// ============ 渲染：驱动器列表 ============
// 动效原则：只对"真正变化"的对象播放动画（新卡入场、开关点亮），
// 整表重建的老卡片保持静止——既有动效反馈，又不会刷新闪烁。
let prevDriveIds = null; // 上次渲染的盘符集合（识别新卡）
let justToggledId = null; // 守护开关刚切换的盘（一次性点亮标记）

function renderDrives() {
  const box = document.getElementById("driveList");
  const prevScroll = box.scrollTop; // 整表重建后恢复滚动位置，避免视觉跳动
  const visibleDrives = state.drives.filter((d) =>
    driveFilter === "guarded"
      ? d.enabled === 1
      : driveFilter === "removable"
        ? Number(d.driveType) === 2
        : true,
  );
  if (visibleDrives.length === 0) {
    box.innerHTML = `<div class="empty">${escapeHtml(t(state.drives.length ? "empty.noMatchingDrives" : "empty.noDrives"))}</div>`;
    updateReadout();
    return;
  }
  box.innerHTML = visibleDrives
    .map((d) => {
      const on = d.enabled === 1;
      const isNew = prevDriveIds !== null && !prevDriveIds.has(d.id);
      const toggled = justToggledId === d.id;
      const tag =
        d.isSystem === 1
          ? `<span class="badge badge-gray">${escapeHtml(t("drive.systemDisk"))}</span>`
          : on
            ? `<span class="badge badge-green">${escapeHtml(t("drive.guarding"))}</span>`
            : `<span class="badge badge-gray">${escapeHtml(t("drive.notGuarding"))}</span>`;
      const used =
        d.size > 0
          ? Math.round(Math.max(0, Math.min(1, 1 - d.freeSpace / d.size)) * 100)
          : 0;
      const meta =
        driveTypeLabel(d.driveType) +
        " · " +
        t("drive.processCount", { count: d.processCount || 0 });
      return `
      <div class="drive-card${on ? " guarded" : ""}${isNew ? " is-new" : ""}${toggled ? " just-toggled" : ""}" data-drive="${escapeHtml(d.id)}">
        <div class="drive-plate">${escapeHtml(d.id)}</div>
        <div class="drive-meta">
          <div class="title">
            <span>${escapeHtml(d.label || t("drive.noLabel"))}</span>
            ${tag}
          </div>
          <div class="sub">${escapeHtml(meta)}</div>
          ${d.size > 0 ? `<div class="capacity"><span data-used="${used}"></span></div><div class="capacity-label">${escapeHtml(t("drive.capacity", { free: fmtSize(d.freeSpace), total: fmtSize(d.size) }))}</div>` : ""}
        </div>
        <div class="drive-actions">
          <button class="btn btn-ghost btn-detail" data-drive="${escapeHtml(d.id)}">${escapeHtml(t("btn.detail"))}</button>
          <label class="switch">
            <input type="checkbox" class="guard-toggle" data-drive="${escapeHtml(d.id)}"
                   aria-label="${escapeHtml(t("drive.toggle", { id: d.id }))}" ${on ? "checked" : ""} ${d.isSystem === 1 ? "disabled" : ""} />
            <span class="slider"></span>
          </label>
        </div>
      </div>`;
    })
    .join("");

  box.querySelectorAll("[data-used]").forEach((el) => {
    el.style.width = el.dataset.used + "%";
  });
  box.querySelectorAll(".guard-toggle").forEach((el) => {
    el.addEventListener("change", async (e) => {
      const driveId = e.target.dataset.drive;
      const enabled = e.target.checked ? 1 : 0;
      e.target.disabled = true;
      try {
        state.drives = await api.setGuard(driveId, enabled);
        justToggledId = driveId;
      } catch {
        showToast(t("feedback.failed"));
      } finally {
        renderDrives();
      }
    });
  });
  box.querySelectorAll(".btn-detail").forEach((el) => {
    bindMagnetic(el);
    el.addEventListener("click", async (e) => {
      const driveId = e.currentTarget.dataset.drive;
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
// 日志仅在弹窗打开时随事件更新；内存最多保留 500 条，DOM 最多展示 100 条。
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
  const box = document.getElementById("eventList");
  const prevScroll = box.scrollTop; // 整表重建后恢复滚动位置，避免视觉跳动
  document.getElementById("eventCount").textContent = t("panel.eventsCount", {
    count: state.events.length,
  });
  const visibleEvents = state.events.filter(
    (e) =>
      (!errorsOnly || e.ok === 0) &&
      (!logQuery ||
        (eventMessage(e) + " " + e.status).toLowerCase().includes(logQuery)),
  );
  if (visibleEvents.length === 0) {
    box.innerHTML = `<div class="empty">${escapeHtml(t(logQuery ? "empty.noSearch" : errorsOnly ? "empty.noErrors" : "empty.noEvents"))}</div>`;
    updateReadout();
    return;
  }
  // 只渲染最近 MAX_DOM_EVENTS 条，超出部分留在内存数组里不进 DOM
  box.innerHTML = visibleEvents
    .slice(0, MAX_DOM_EVENTS)
    .map(eventNodeHtml)
    .join("");
  box.scrollTop = prevScroll;
  updateReadout();
}

// 关键业务事件 → 派发给 3D 场景打脉冲（scene3d.js 监听）
const PULSE_EVENTS = new Set([
  "drive_connected",
  "drive_removed",
  "guard_enabled",
  "guard_disabled",
  "kill_dispatched",
  "process_killed",
]);

function pushEvent(evt) {
  state.events.unshift(evt);
  if (state.events.length > MAX_EVENT_LOG) state.events.length = MAX_EVENT_LOG;
  if (PULSE_EVENTS.has(evt.status)) {
    window.dispatchEvent(new CustomEvent("usbguard-evt", { detail: evt }));
  }

  if (logOpen) renderEvents();
  else updateReadout();
}

// ============ 渲染：设置 ============
function renderSettings() {
  const s = state.settings;
  document.getElementById("setKillChildren").checked = s.killChildren === 1;
  document.getElementById("setAutoGuard").checked = s.autoGuardRemovable === 1;
  document.getElementById("setMinimizeToTray").checked = s.minimizeToTray === 1;
  document.getElementById("setAutoLaunch").checked = s.autoLaunch === 1;
  document.getElementById("setLockAlert").checked = s.lockAlert === 1;
  document.getElementById("setLockInterval").value = String(
    Math.min(600, Math.max(5, Number(s.lockAlertIntervalSec) || 30)),
  );
  document.getElementById("setMotion").checked = s.motionPaused !== 1;
  document.getElementById("setPointerEffect").checked = s.pointerEffect !== 0;
  document.getElementById("qualitySelect").value =
    s.visualQuality || "balanced";
  renderSceneSelect();
}

// 保留旧配置键 core / nebula，分别映射为山谷与团队场景。
function renderSceneSelect() {
  const sel = document.getElementById("sceneSelect");
  const current = state.settings.scene3d || "core";
  sel.innerHTML = ["core", "nebula", "tunnel", "glass", "off"]
    .map(
      (o) =>
        `<option value="${o}" ${o === current ? "selected" : ""}>${escapeHtml(t("scene." + o))}</option>`,
    )
    .join("");
}

async function savePreference(patch) {
  try {
    state.settings = await api.updateSettings(patch);
    return true;
  } catch {
    renderSettings();
    showToast(t("feedback.failed"));
    return false;
  }
}
function bindSettings() {
  const bind = (id, key) => {
    document.getElementById(id).addEventListener("change", async (e) => {
      await savePreference({ [key]: e.target.checked ? 1 : 0 });
    });
  };
  bind("setKillChildren", "killChildren");
  bind("setAutoGuard", "autoGuardRemovable");
  bind("setMinimizeToTray", "minimizeToTray");
  bind("setAutoLaunch", "autoLaunch");
  bind("setLockAlert", "lockAlert");

  // 提醒间隔（秒）：5 ~ 600，输入后夹取并回写
  document
    .getElementById("setLockInterval")
    .addEventListener("change", async (e) => {
      const v = Math.min(600, Math.max(5, Number(e.target.value) || 30));
      e.target.value = String(v);
      await savePreference({ lockAlertIntervalSec: v });
    });

  // 3D 背景切换：持久化 + 通知场景层。
  // 初始值同时经 data-scene3d（scene3d.js 启动时读取）与事件（运行时切换）双通道传递，
  // 避免 classic script 与 module 加载时序竞态。
  document
    .getElementById("sceneSelect")
    .addEventListener("change", async (e) => {
      const next = e.target.value;
      if (!(await savePreference({ scene3d: next }))) return;
      syncSceneChoices();
      document.documentElement.dataset.scene3d = next;
      window.dispatchEvent(new CustomEvent("usbguard-scene", { detail: next }));
    });
  document.getElementById("setMotion").addEventListener("change", async (e) => {
    if (await savePreference({ motionPaused: e.target.checked ? 0 : 1 }))
      setMotionPaused(!e.target.checked);
  });
  document
    .getElementById("setPointerEffect")
    .addEventListener("change", async (e) => {
      if (await savePreference({ pointerEffect: e.target.checked ? 1 : 0 })) {
        document.documentElement.dataset.pointerEffect = e.target.checked
          ? "on"
          : "off";
        window.dispatchEvent(new Event("usbguard-pointer-toggle"));
      }
    });
  document
    .getElementById("qualitySelect")
    .addEventListener("change", async (e) => {
      if (await savePreference({ visualQuality: e.target.value })) {
        document.documentElement.dataset.quality = e.target.value;
        window.dispatchEvent(
          new CustomEvent("usbguard-quality", { detail: e.target.value }),
        );
      }
    });
  document.querySelectorAll("[data-scene-choice]").forEach((button) =>
    button.addEventListener("click", () => {
      const select = document.getElementById("sceneSelect");
      select.value = button.dataset.sceneChoice;
      select.dispatchEvent(new Event("change"));
    }),
  );
  document.documentElement.dataset.quality =
    state.settings.visualQuality || "balanced";
  setMotionPaused(state.settings.motionPaused === 1);
  document.documentElement.dataset.pointerEffect =
    state.settings.pointerEffect === 0 ? "off" : "on";
  window.dispatchEvent(new Event("usbguard-pointer-toggle"));
  syncSceneChoices();
  const initial = state.settings.scene3d || "core";
  document.documentElement.dataset.scene3d = initial;
  window.dispatchEvent(new CustomEvent("usbguard-scene", { detail: initial }));
}

// ============ 动效（GSAP） ============
// 全部动效走 GSAP 编排：统一节奏/缓动/层次，gsap 未加载时界面功能不受影响。

// 磁吸悬停：鼠标在按钮内移动产生惯性微位移，移出归位
function bindMagnetic(el) {
  if (
    !window.gsap ||
    el.dataset.magnetic ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  el.dataset.magnetic = "1";
  const xTo = gsap.quickTo(el, "x", { duration: 0.45, ease: "power3.out" });
  const yTo = gsap.quickTo(el, "y", { duration: 0.45, ease: "power3.out" });
  el.addEventListener("mousemove", (e) => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    xTo((e.clientX - r.left - r.width / 2) * 0.22);
    yTo((e.clientY - r.top - r.height / 2) * 0.32);
  });
  el.addEventListener("mouseleave", () => {
    xTo(0);
    yTo(0);
  });
}

// Keep entrance motion brief; live numbers always reflect the current state.
function playEntrance() {
  if (!window.gsap || matchMedia("(prefers-reduced-motion: reduce)").matches)
    return;
  gsap.from(".hero-copy > *", {
    y: 14,
    opacity: 0,
    stagger: 0.06,
    duration: 0.6,
    ease: "power3.out",
    clearProps: "all",
  });
  gsap.from(".readout-item, .panel", {
    y: 18,
    opacity: 0,
    stagger: 0.05,
    duration: 0.5,
    delay: 0.15,
    clearProps: "all",
  });
}

// ============ 明细抽屉 ============
function openDrawer(driveId) {
  currentDriveId = driveId;
  const drive = state.drives.find((d) => d.id === driveId);
  const label = drive && drive.label ? ` (${drive.label})` : "";
  document.getElementById("drawerTitle").textContent =
    `${t("panel.processDetail")} · ${driveId}${label}`;
  const drawer = document.getElementById("detailDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  drawer.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  renderDrawerBody();
  // 焦点移入抽屉，键盘用户可直接操作（Esc 关闭）
  document.getElementById("drawerClose").focus();
  // GSAP 模块切换过渡：遮罩淡入 + 面板滑入 + 进程行依次就位
  if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: 0.28, ease: "power2.out" },
    );
    gsap.fromTo(
      drawer,
      { x: 44, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.42, ease: "power3.out" },
    );
    gsap.fromTo(
      ".proc-row",
      { y: 12, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.05,
        duration: 0.35,
        ease: "power2.out",
        delay: 0.12,
      },
    );
  }
}

function renderDrawerBody() {
  const body = document.getElementById("drawerBody");
  const drive = state.drives.find((d) => d.id === currentDriveId);
  const procs = (drive && drive.processList) || [];
  if (procs.length === 0) {
    body.innerHTML = `<div class="empty">${escapeHtml(t("empty.noProcesses"))}</div>`;
    return;
  }
  body.innerHTML = procs
    .map(
      (p) => `
    <div class="proc-row">
      <div>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="path" title="${escapeHtml(p.exePath)}">${escapeHtml(p.exePath)}</div>
      </div>
      <div class="pid">${escapeHtml(t("proc.pid", { pid: p.pid }))}</div>
    </div>`,
    )
    .join("");
}

function closeDrawer() {
  currentDriveId = null;
  const drawer = document.getElementById("detailDrawer");
  const backdrop = document.getElementById("drawerBackdrop");
  // GSAP 退出过渡：滑出 + 淡出后再隐藏，避免生硬消失
  if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.to(backdrop, { opacity: 0, duration: 0.2, ease: "power2.in" });
    gsap.to(drawer, {
      x: 32,
      opacity: 0,
      duration: 0.24,
      ease: "power2.in",
      onComplete: () => {
        drawer.classList.add("hidden");
        backdrop.classList.add("hidden");
        gsap.set([drawer, backdrop], { clearProps: "transform,opacity" });
      },
    });
    return;
  }
  drawer.classList.add("hidden");
  backdrop.classList.add("hidden");
}

// ============ 关于弹窗 ============
let aboutOpen = false;

function openAbout() {
  if (aboutOpen) return;
  if (logOpen) closeLog();
  if (settingsOpen) closeSettings();
  aboutOpen = true;
  const dialog = document.getElementById("aboutDialog");
  const backdrop = document.getElementById("aboutBackdrop");
  dialog.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  document.getElementById("aboutVersion").textContent =
    "v" + (state.version || "");
  document.getElementById("aboutClose").focus();
  if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: "power2.out" },
    );
    gsap.fromTo(
      dialog,
      { y: 18, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.35,
        ease: "power3.out",
        clearProps: "transform,opacity",
      },
    );
  }
}

function closeAbout() {
  if (!aboutOpen) return;
  aboutOpen = false;
  const dialog = document.getElementById("aboutDialog");
  const backdrop = document.getElementById("aboutBackdrop");
  const done = () => {
    dialog.classList.add("hidden");
    backdrop.classList.add("hidden");
    if (window.gsap)
      gsap.set([dialog, backdrop], { clearProps: "transform,opacity" });
  };
  if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.to(backdrop, { opacity: 0, duration: 0.18, ease: "power2.in" });
    gsap.to(dialog, {
      y: 12,
      opacity: 0,
      duration: 0.22,
      ease: "power2.in",
      onComplete: done,
    });
    return;
  }
  done();
}

// ============ 设置弹窗 ============
let settingsOpen = false;

function openSettings() {
  if (settingsOpen) return;
  if (logOpen) closeLog();
  settingsOpen = true;
  const dialog = document.getElementById("settingsDialog");
  const backdrop = document.getElementById("settingsBackdrop");
  dialog.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  renderSettings();
  document.getElementById("settingsClose").focus();
  // GSAP 过渡：遮罩淡入 + 弹窗上浮 + 设置项依次就位
  // 注意：不用 scale 动画——纹理缩放会让文字发虚；结束清掉 transform 防残留
  if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.fromTo(
      backdrop,
      { opacity: 0 },
      { opacity: 1, duration: 0.25, ease: "power2.out" },
    );
    gsap.fromTo(
      dialog,
      { y: 18, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.35,
        ease: "power3.out",
        clearProps: "transform,opacity",
      },
    );
    gsap.fromTo(
      ".dialog .setting-row",
      { y: 10, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        stagger: 0.05,
        duration: 0.3,
        ease: "power2.out",
        delay: 0.08,
        clearProps: "transform,opacity",
      },
    );
  }
}

function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;
  const dialog = document.getElementById("settingsDialog");
  const backdrop = document.getElementById("settingsBackdrop");
  const done = () => {
    dialog.classList.add("hidden");
    backdrop.classList.add("hidden");
    if (window.gsap)
      gsap.set([dialog, backdrop], { clearProps: "transform,opacity" });
    if (!logOpen && !aboutOpen) document.getElementById("btnSettings").focus();
  };
  if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    gsap.to(backdrop, { opacity: 0, duration: 0.18, ease: "power2.in" });
    gsap.to(dialog, {
      y: 12,
      opacity: 0,
      duration: 0.22,
      ease: "power2.in",
      onComplete: done,
    });
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
  renderSettings();
  renderMotionButton();
  renderDrives();
  renderEvents();
  syncSceneChoices();
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

  await loadI18n(s.locale || "en");

  renderLangSelect();
  renderDrives();
  renderEvents();
  renderSettings();
  bindSettings();

  // 主题：按持久化设置应用，system 模式实时跟随系统变化
  applyTheme(state.settings.theme || "system");
  renderThemeSelect();
  document
    .getElementById("themeSelect")
    .addEventListener("change", async (e) => {
      state.settings = await api.updateSettings({ theme: e.target.value });
      applyTheme(e.target.value);
      renderThemeSelect();
    });
  systemLightMq.addEventListener("change", () => {
    if ((state.settings.theme || "system") === "system") applyTheme("system");
  });

  document.getElementById("langSelect").addEventListener("change", (e) => {
    switchLocale(e.target.value);
  });

  document.getElementById("btnRefresh").addEventListener("click", async () => {
    const btn = document.getElementById("btnRefresh");
    if (!setBtnBusy(btn, "btn.refreshing")) return;
    try {
      state.drives = await api.refresh();
      await refreshDriveProcesses();
      renderDrives();
    } finally {
      setBtnIdle(btn, "btn.refresh");
    }
  });
  document.getElementById("drawerClose").addEventListener("click", closeDrawer);
  // 遮罩点击 / Esc 关闭抽屉
  document
    .getElementById("drawerBackdrop")
    .addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Let the titlebar menu consume Escape before closing its underlying dialog.
    if (document.querySelector('.menu-trigger[aria-expanded="true"]')) return;
    // Esc 优先关闭最上层：关于/设置弹窗 → 进程抽屉
    if (aboutOpen) {
      closeAbout();
      return;
    }
    if (logOpen) {
      closeLog();
      return;
    }
    if (settingsOpen) {
      closeSettings();
      return;
    }
    if (currentDriveId) closeDrawer();
  });

  // 设置弹窗
  document
    .getElementById("btnSettings")
    .addEventListener("click", openSettings);
  document
    .getElementById("settingsClose")
    .addEventListener("click", closeSettings);
  document
    .getElementById("settingsBackdrop")
    .addEventListener("click", closeSettings);

  // 关于弹窗（菜单触发 + 仓库链接用系统浏览器打开）
  document.getElementById("aboutClose").addEventListener("click", closeAbout);
  document
    .getElementById("aboutBackdrop")
    .addEventListener("click", closeAbout);
  document.getElementById("aboutRepoLink").addEventListener("click", (e) => {
    e.preventDefault();
    api.openExternal("https://github.com/FlyingTigerReally/usb-guard");
  });
  api.onShowAbout(openAbout);
  document.getElementById("btnKillAll").addEventListener("click", async () => {
    if (!currentDriveId) return;
    const btn = document.getElementById("btnKillAll");
    if (!setBtnBusy(btn, "btn.killing")) return;
    try {
      await api.killAll(currentDriveId);
      state.drives = await api.refresh();
      await refreshDriveProcesses();
      renderDrives();
      renderDrawerBody();
    } finally {
      setBtnIdle(btn, "btn.killAll");
    }
  });

  setupWorkspaceControls();
  setupUniverse();
  document.getElementById("appVersion").textContent = "v" + state.version;

  // 入场编排
  playEntrance();
}

// 会改变驱动器列表或进程计数的事件状态（英文枚举）
const DRIVE_AFFECTING_EVENTS = new Set([
  "drive_connected", // 新盘接入（启动扫描完成时也会触发，用于补渲染启动竞态）
  "drive_removed", // 盘拔出
  "guard_enabled", // 守护开关变化
  "guard_disabled",
  "snapshot_updated", // 进程快照变化
  "kill_dispatched", // 进程被批量关闭
  "process_killed",
  "process_kill_failed",
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

init().catch((error) => {
  console.error(error);
  showToast(t("feedback.failed"));
});

// Custom title bar, keyboard navigation and workspace filters.
let toastTimer;
function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}
async function exportLog() {
  try {
    const result = await api.exportEvents();
    if (result && !result.canceled) showToast(t("feedback.exported"));
  } catch {
    showToast(t("feedback.failed"));
  }
}
function renderMotionButton() {
  const button = document.getElementById("btnMotion");
  button.textContent = t(motionPaused ? "scene.resume" : "scene.pause");
  button.setAttribute("aria-pressed", String(motionPaused));
  button.disabled =
    (state.settings.scene3d || "core") === "off" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function setupWorkspaceControls() {
  const triggers = [...document.querySelectorAll(".menu-trigger")];
  function closeMenus() {
    triggers.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.nextElementSibling.classList.add("hidden");
    });
  }
  function openMenu(button, focus = false) {
    closeMenus();
    button.setAttribute("aria-expanded", "true");
    button.nextElementSibling.classList.remove("hidden");
    if (focus) button.nextElementSibling.querySelector("button").focus();
  }
  triggers.forEach((button) => {
    button.addEventListener("click", () => {
      const wasOpen = button.getAttribute("aria-expanded") === "true";
      closeMenus();
      if (!wasOpen) openMenu(button);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        openMenu(button, true);
      }
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".menu-wrap")) closeMenus();
  });
  document.addEventListener("focusin", (event) => {
    if (!event.target.closest(".menu-wrap")) closeMenus();
  });
  document.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", () => {
      closeMenus();
      const action = button.dataset.action;
      if (action === "export") exportLog();
      else if (action === "refresh")
        document.getElementById("btnRefresh").click();
      else if (action === "settings") openSettings();
      else if (action === "about") openAbout();
      else api.menuAction(action);
    }),
  );
  document.addEventListener("keydown", (event) => {
    const openTrigger = triggers.find(
      (button) => button.getAttribute("aria-expanded") === "true",
    );
    if (event.key === "Escape" && openTrigger) {
      closeMenus();
      openTrigger.focus();
    }
    if (openTrigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const items = [
        ...openTrigger.nextElementSibling.querySelectorAll("button"),
      ];
      const index = items.indexOf(document.activeElement);
      items[
        (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
          items.length
      ].focus();
    }
    if (openTrigger && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const index = triggers.indexOf(openTrigger);
      openMenu(
        triggers[
          (index + (event.key === "ArrowRight" ? 1 : -1) + triggers.length) %
            triggers.length
        ],
        true,
      );
    }
    if (event.key === "F5") {
      event.preventDefault();
      document.getElementById("btnRefresh").click();
    }
    if (event.ctrlKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      api.menuAction("hide");
    }
    if (event.ctrlKey && event.key.toLowerCase() === "q") {
      event.preventDefault();
      api.menuAction("quit");
    }
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "i") {
      event.preventDefault();
      api.menuAction("devtools");
    }
    if (event.key === "Tab") {
      const dialog = aboutOpen
        ? document.getElementById("aboutDialog")
        : settingsOpen
          ? document.getElementById("settingsDialog")
          : logOpen
            ? document.getElementById("logDialog")
            : currentDriveId
              ? document.getElementById("detailDrawer")
              : null;
      if (!dialog) return;
      const elements = [
        ...dialog.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select,a[href]",
        ),
      ];
      const visibleElements = elements.filter(
        (el) => el.getClientRects().length && el.tabIndex >= 0,
      );
      elements.splice(0, elements.length, ...visibleElements);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  document
    .getElementById("winMinimize")
    .addEventListener("click", () => api.windowControl("minimize"));
  document
    .getElementById("winMaximize")
    .addEventListener("click", () => api.windowControl("maximize"));
  document
    .getElementById("winClose")
    .addEventListener("click", () => api.windowControl("close"));
  api.onWindowState(({ maximized }) => {
    document
      .getElementById("maximizeIcon")
      .setAttribute(
        "d",
        maximized ? "M5 3h8v8M3 5h8v8H3z" : "M3.5 3.5h9v9h-9z",
      );
    const button = document.getElementById("winMaximize");
    button.dataset.i18nTitle = maximized ? "window.restore" : "window.maximize";
    button.title = t(button.dataset.i18nTitle);
    button.setAttribute("aria-label", button.title);
  });
  document.querySelectorAll("[data-drive-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      driveFilter = button.dataset.driveFilter;
      document.querySelectorAll("[data-drive-filter]").forEach((el) => {
        const active = el === button;
        el.classList.toggle("active", active);
        el.setAttribute("aria-pressed", String(active));
      });
      renderDrives();
    }),
  );
  document.getElementById("errorsOnly").addEventListener("change", (event) => {
    errorsOnly = event.target.checked;
    renderEvents();
  });
  document.getElementById("btnExport").addEventListener("click", exportLog);
  document.getElementById("btnMotion").addEventListener("click", async () => {
    const next = !motionPaused;
    if (await savePreference({ motionPaused: next ? 1 : 0 }))
      setMotionPaused(next);
  });
  window.addEventListener("usbguard-scene", renderMotionButton);
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    renderMotionButton,
  );
  renderMotionButton();
  document.getElementById("eventList").addEventListener("scroll", (event) => {
    const box = event.currentTarget;
    const total = box.scrollHeight - box.clientHeight;
    document.getElementById("scrollProgress").style.width =
      (total > 0 ? (box.scrollTop / total) * 100 : 0) + "%";
  });
}
window.addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
  showToast(t("feedback.failed"));
});

function setMotionPaused(next) {
  motionPaused = next;
  document.documentElement.dataset.motion = next ? "paused" : "playing";
  document.getElementById("setMotion").checked = !next;
  renderMotionButton();
  window.dispatchEvent(new CustomEvent("usbguard-motion", { detail: next }));
}
function syncSceneChoices() {
  const preset = { core: 0, nebula: 1, tunnel: 2, glass: 4 }[
    state.settings.scene3d || "core"
  ];
  document
    .querySelectorAll("[data-preview]")
    .forEach((el) =>
      el.classList.toggle("active", Number(el.dataset.preview) === preset),
    );
  document.querySelectorAll("[data-scene-choice]").forEach((el) => {
    const active =
      el.dataset.sceneChoice === (state.settings.scene3d || "core");
    el.classList.toggle("active", active);
    el.setAttribute("aria-pressed", String(active));
  });
}
function setSettingsTab(tab, focus = false) {
  const tabs = [...document.querySelectorAll("[data-settings-tab]")];
  tabs.forEach((el) => {
    const active = el.dataset.settingsTab === tab;
    el.classList.toggle("active", active);
    el.setAttribute("aria-selected", String(active));
    el.tabIndex = active ? 0 : -1;
    if (active && focus) el.focus();
  });
  document
    .querySelectorAll(".settings-pane")
    .forEach((el) =>
      el.classList.toggle("hidden", el.id !== "settings-" + tab),
    );
}
function openLog() {
  if (settingsOpen) closeSettings();
  logOpen = true;
  renderEvents();
  document.getElementById("logDialog").classList.remove("hidden");
  document.getElementById("logBackdrop").classList.remove("hidden");
  document.getElementById("logSearch").focus();
  if (window.gsap && !matchMedia("(prefers-reduced-motion: reduce)").matches)
    gsap.fromTo(
      "#logDialog",
      { y: 16, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, clearProps: "all" },
    );
}
function closeLog() {
  logOpen = false;
  document.getElementById("logDialog").classList.add("hidden");
  document.getElementById("logBackdrop").classList.add("hidden");
  document.getElementById("btnLogs").focus();
}
function setupUniverse() {
  const stage = document.getElementById("visualStage"),
    scroller = document.getElementById("experienceScroll");
  let view = "devices";
  function selectView(next) {
    view = next;
    document.documentElement.dataset.view = next;
    document
      .getElementById("devicesView")
      .classList.toggle("hidden", next !== "devices");
    document
      .getElementById("experienceView")
      .classList.toggle("hidden", next !== "experience");
    document
      .getElementById(next === "devices" ? "dashboardStage" : "experienceStage")
      .append(stage);
    document.querySelectorAll("button[data-view]").forEach((el) => {
      const active = el.dataset.view === next;
      el.classList.toggle("active", active);
      el.setAttribute("aria-pressed", String(active));
    });
    window.dispatchEvent(new CustomEvent("usbguard-view", { detail: next }));
    if (next === "experience") {
      scroller.focus({ preventScroll: true });
      updateScroll();
    }
  }
  document
    .querySelectorAll("button[data-view]")
    .forEach((el) =>
      el.addEventListener("click", () => selectView(el.dataset.view)),
    );
  document
    .getElementById("btnExplore")
    .addEventListener("click", () => selectView("experience"));
  document
    .getElementById("btnReturn")
    .addEventListener("click", () => selectView("devices"));
  function updateScroll() {
    const value = Math.max(
      0,
      Math.min(6, scroller.scrollTop / scroller.clientHeight),
    );
    document.getElementById("journeyProgress").style.width =
      (value / 6) * 100 + "%";
    document.querySelectorAll("[data-jump]").forEach((el) => {
      const active = Number(el.dataset.jump) === Math.round(value);
      el.classList.toggle("active", active);
      if (active) el.setAttribute("aria-current", "step");
      else el.removeAttribute("aria-current");
    });
    window.dispatchEvent(
      new CustomEvent("usbguard-progress", { detail: value }),
    );
  }
  scroller.addEventListener("scroll", updateScroll, { passive: true });
  new ResizeObserver(() => {
    if (view === "experience") updateScroll();
  }).observe(scroller);
  document.querySelectorAll("[data-jump]").forEach((el) =>
    el.addEventListener("click", () =>
      scroller.scrollTo({
        top: Number(el.dataset.jump) * scroller.clientHeight,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    ),
  );
  document.querySelectorAll("[data-preview]").forEach((el) =>
    el.addEventListener("click", () => {
      document
        .querySelectorAll("[data-preview]")
        .forEach((b) => b.classList.toggle("active", b === el));
      window.dispatchEvent(
        new CustomEvent("usbguard-preview", {
          detail: Number(el.dataset.preview),
        }),
      );
    }),
  );
  document.querySelectorAll("[data-team]").forEach((el) =>
    el.addEventListener("click", () => {
      document.querySelectorAll("[data-team]").forEach((b) => {
        b.classList.toggle("active", b === el);
        b.setAttribute("aria-pressed", String(b === el));
      });
      window.dispatchEvent(
        new CustomEvent("usbguard-team", { detail: Number(el.dataset.team) }),
      );
    }),
  );
  document.querySelectorAll("[data-settings-tab]").forEach((el, index, all) => {
    el.addEventListener("click", () => setSettingsTab(el.dataset.settingsTab));
    el.addEventListener("keydown", (e) => {
      if (
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      const next =
        e.key === "Home"
          ? 0
          : e.key === "End"
            ? all.length - 1
            : (index + (/Right|Down/.test(e.key) ? 1 : -1) + all.length) %
              all.length;
      setSettingsTab(all[next].dataset.settingsTab, true);
    });
  });
  document.querySelectorAll("[data-settings-target]").forEach((el) =>
    el.addEventListener("click", () => {
      openSettings();
      setSettingsTab(el.dataset.settingsTarget);
    }),
  );
  document.getElementById("btnLogs").addEventListener("click", openLog);
  document.getElementById("statLogButton").addEventListener("click", openLog);
  document.getElementById("logClose").addEventListener("click", closeLog);
  document.getElementById("logBackdrop").addEventListener("click", closeLog);
  document.getElementById("logSearch").addEventListener("input", (e) => {
    logQuery = e.target.value.trim().toLowerCase();
    renderEvents();
  });

  document.querySelectorAll(".btn").forEach(bindMagnetic);
  document.addEventListener("pointerdown", (e) => {
    const button = e.target.closest(".btn");
    if (
      !button ||
      button.disabled ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const rect = button.getBoundingClientRect(),
      ripple = document.createElement("span"),
      diameter = Math.max(rect.width, rect.height) * 2;
    ripple.className = "button-ripple";
    ripple.setAttribute("aria-hidden", "true");
    ripple.style.width = ripple.style.height = diameter + "px";
    ripple.style.left = e.clientX - rect.left - diameter / 2 + "px";
    ripple.style.top = e.clientY - rect.top - diameter / 2 + "px";
    button.append(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), {
      once: true,
    });
  });
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest(".btn,.drive-card,.capability-card");
    if (!card) return;
    const r = card.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top;
    card.style.setProperty("--mx", x + "px");
    card.style.setProperty("--my", y + "px");
    if (
      card.classList.contains("capability-card") &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      card.style.transform =
        "perspective(800px) rotateX(" +
        (0.5 - y / r.height) * 5 +
        "deg) rotateY(" +
        (x / r.width - 0.5) * 5 +
        "deg)";
    }
  });
  document
    .querySelectorAll(".capability-card")
    .forEach((el) =>
      el.addEventListener("pointerleave", () => (el.style.transform = "")),
    );
}
