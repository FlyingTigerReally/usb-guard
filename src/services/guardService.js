/**
 * 守护编排服务
 * ---------------------------------------------------------------
 * 把 driveWatcher + processGuard + settings 串起来：
 * 1. 事件日志（带环形上限）；
 * 2. 监控集合管理（哪些盘需要守护，状态用 0/1 与英文枚举）；
 * 3. 周期性进程快照；
 * 4. 拔出 → 立即关闭快照内全部相关进程。
 */
const { createDriveWatcher } = require('./driveWatcher');
const {
  scanDriveProcesses,
  buildSnapshot,
  killProcesses,
  scanAllProcesses,
} = require('./processGuard');

// 事件 status 取值域（英文枚举，用于 i18n key: 'evt.<status>'）
const EVT = {
  DRIVE_CONNECTED: 'drive_connected',
  DRIVE_REMOVED: 'drive_removed',
  GUARD_ENABLED: 'guard_enabled',
  GUARD_DISABLED: 'guard_disabled',
  SNAPSHOT_UPDATED: 'snapshot_updated',
  KILL_DISPATCHED: 'kill_dispatched',
  PROCESS_KILLED: 'process_killed',
  PROCESS_KILL_FAILED: 'process_kill_failed',
  KILL_SKIPPED: 'kill_skipped',
  NO_TRACKED_PROCESS: 'no_tracked_process',
  WATCH_PAUSED: 'watch_paused',
  WATCH_ERROR: 'watch_error',
  WATCH_START_FAILED: 'watch_start_failed',
};

function createGuardService(settings) {
  // 事件日志
  const events = [];
  // 监控集合：key=盘符 id，value={ drive, processes: Map<pid, proc>, enabled: 0|1 }
  const monitored = new Map();
  let snapshotTimer = null;
  let watcher = null;
  let listener = null;
  let eventSeq = 0;

  /**
   * 事件对象只存英文状态 + 参数，文案由渲染层按当前语言翻译
   * @param {string} status 英文枚举（对应 i18n key 'evt.<status>'）
   * @param {number} ok 1 = 正常，0 = 异常
   * @param {string} driveId 盘符
   * @param {object} [params] 翻译占位符参数
   */
  function emitEvent(status, ok, driveId, params) {
    const evt = {
      id: `evt-${++eventSeq}`,
      timestamp: Date.now(),
      status,
      ok: ok ? 1 : 0,
      driveId,
      params: params || {},
    };
    events.unshift(evt);
    if (events.length > settings.maxEvents) events.length = settings.maxEvents;
    if (listener) listener(evt);
    return evt;
  }

  function onEvent(fn) {
    listener = fn;
  }

  function getEvents() {
    return events;
  }

  function getDrives() {
    const list = [];
    for (const [id, item] of monitored) {
      list.push({
        ...item.drive,
        enabled: item.enabled,
        processCount: item.processes.size,
        processList: [...item.processes.values()],
      });
    }
    // U 盘（可移动磁盘，driveType=2）排前面，其余按盘符排序
    return list.sort((a, b) => {
      const ra = Number(a.driveType) === 2 ? 0 : 1;
      const rb = Number(b.driveType) === 2 ? 0 : 1;
      return ra - rb || a.id.localeCompare(b.id);
    });
  }

  function getProcesses(driveId) {
    const item = monitored.get(driveId);
    return item ? [...item.processes.values()] : [];
  }

  // 开启/关闭某盘守护（0/1 状态）
  function setGuard(driveId, enabled) {
    const item = monitored.get(driveId);
    if (!item) return null;
    const next = enabled ? 1 : 0;
    if (item.enabled === next) return item;
    item.enabled = next;
    if (next === 1) {
      emitEvent(EVT.GUARD_ENABLED, 1, driveId, { id: driveId });
    } else {
      emitEvent(EVT.GUARD_DISABLED, 1, driveId, { id: driveId });
    }
    return item;
  }

  // 拔出 → 关闭全部相关进程
  async function killAllForDrive(driveId) {
    const item = monitored.get(driveId);
    if (!item) return { killed: 0 };

    // 拔出瞬间做一次“按需扫描”，抓取最新进程（含最后一次快照之后新启动的）。
    // 相比只依赖周期快照：更及时，且允许把快照间隔调大以降低常驻 CPU/IO。
    try {
      const fresh = await scanDriveProcesses(driveId, item.drive.volumeSerialNumber, null);
      for (const p of fresh) {
        if (!item.processes.has(p.pid)) item.processes.set(p.pid, p);
      }
    } catch {
      // 扫描失败则回退到已有快照，保证仍有可关闭目标
    }

    const pids = [...item.processes.keys()];
    if (pids.length === 0) {
      emitEvent(EVT.NO_TRACKED_PROCESS, 1, driveId, { id: driveId });
      return { killed: 0 };
    }
    emitEvent(EVT.KILL_DISPATCHED, 1, driveId, { id: driveId, count: pids.length });
    const results = await killProcesses(pids, settings.killChildren);
    let killed = 0;
    for (const r of results) {
      const proc = item.processes.get(r.pid);
      const name = proc ? proc.name : `PID ${r.pid}`;
      if (r.ok === 1) {
        killed++;
        emitEvent(EVT.PROCESS_KILLED, 1, driveId, { name, pid: r.pid });
      } else {
        emitEvent(EVT.PROCESS_KILL_FAILED, 0, driveId, { name, pid: r.pid, error: r.error });
      }
      item.processes.delete(r.pid);
    }
    return { killed };
  }

  // 周期快照：刷新所有监控盘的进程列表
  async function refreshSnapshots() {
    // 无任何守护中的盘：直接跳过扫描，避免无意义地 spawn PowerShell
    let active = false;
    for (const [, item] of monitored) {
      if (item.enabled === 1) { active = true; break; }
    }
    if (!active) return;

    let allProcesses = null;
    // 一次扫全盘进程表，多个盘共享，避免重复调用
    try {
      allProcesses = await scanAllProcesses();
    } catch {
      allProcesses = [];
    }
    for (const [id, item] of monitored) {
      if (item.enabled !== 1) continue;
      const baseline = await scanDriveProcesses(id, item.drive.volumeSerialNumber, allProcesses);
      const snapshot = buildSnapshot(baseline, allProcesses || []);
      const next = new Map(snapshot.map((p) => [p.pid, p]));
      item.processes = next;
      // 关键优化：仅当进程集合真的变化时才发事件。
      // 否则每 2 秒一条 snapshot_updated 会在长时间运行后刷屏日志。
      const signature = [...next.keys()].sort((a, b) => a - b).join(',');
      if (signature !== item.lastSignature) {
        item.lastSignature = signature;
        emitEvent(EVT.SNAPSHOT_UPDATED, 1, id, { id, count: next.size });
      }
    }
  }

  // 驱动器接入
  function handleConnected(drive) {
    const prev = monitored.get(drive.id);
    monitored.set(drive.id, {
      drive,
      processes: prev ? prev.processes : new Map(),
      enabled: prev ? prev.enabled : 0,
      // 上次快照的进程签名（PID 集合），用于判断快照是否真的变化
      lastSignature: prev ? prev.lastSignature : '',
    });
    if (!prev) {
      emitEvent(EVT.DRIVE_CONNECTED, 1, drive.id, {
        id: drive.id,
        label: drive.label ? ` (${drive.label})` : '',
      });
      // 可移动磁盘自动开启守护（可配置）
      if (settings.autoGuardRemovable === 1 && drive.driveType === 2 && drive.isSystem !== 1) {
        setGuard(drive.id, 1);
      }
    }
  }

  // 驱动器拔出
  async function handleRemoved(drive) {
    const item = monitored.get(drive.id);
    emitEvent(EVT.DRIVE_REMOVED, 1, drive.id, {
      id: drive.id,
      label: drive.label ? ` (${drive.label})` : '',
    });
    if (!item || item.enabled !== 1) {
      if (item) emitEvent(EVT.KILL_SKIPPED, 1, drive.id, { id: drive.id });
      monitored.delete(drive.id);
      return;
    }
    await killAllForDrive(drive.id);
    monitored.delete(drive.id);
  }

  async function start() {
    watcher = createDriveWatcher({
      onConnected: handleConnected,
      onRemoved: handleRemoved,
      onError: (err) => emitEvent(EVT.WATCH_ERROR, 0, '', { error: err.message }),
      pollMs: settings.removePollMs,
    });
    try {
      await watcher.start();
    } catch (err) {
      emitEvent(EVT.WATCH_START_FAILED, 0, '', { error: err.message });
    }
    snapshotTimer = setInterval(() => {
      refreshSnapshots();
    }, settings.snapshotIntervalMs);
    refreshSnapshots();
  }

  function stop() {
    if (watcher) watcher.stop();
    if (snapshotTimer) clearInterval(snapshotTimer);
    snapshotTimer = null;
    monitored.clear();
    emitEvent(EVT.WATCH_PAUSED, 1, '', {});
  }

  return {
    start,
    stop,
    onEvent,
    getEvents,
    getDrives,
    getProcesses,
    setGuard,
    killAllForDrive,
    refreshSnapshots,
    EVT,
  };
}

module.exports = { createGuardService };
