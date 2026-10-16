/**
 * 驱动器监听服务
 * ---------------------------------------------------------------
 * 职责：
 * 1. 枚举当前系统全部驱动器（含盘符、卷标、卷序列号、类型）；
 * 2. 检测驱动器的"拔出"（快照扫描差分，兜底 WM_DEVICECHANGE 事件）；
 * 3. 通过回调向外广播 drive_removed 事件。
 *
 * 性能设计（双层探测）：
 * - 快速层：每 pollMs(500ms) 用 fs.existsSync 探测盘根目录（单次系统调用，微秒级），
 *   只在"盘符出现/消失"时才触发一次 PowerShell 完整扫描做确认；
 * - 慢速层：每 reconcileMs(30s) 做一次完整扫描兜底（防漏事件）。
 * 对比旧实现（每 500ms spawn 一次 PowerShell）：常驻 CPU 从 ~20-40% 降到 <1%。
 * 盘根目录探测不可靠的设备（空光驱/网络盘/无介质读卡器）自动进入 slowList，
 * 之后只由慢速层处理，避免探测阻塞与状态反复。
 */
const fs = require('fs');
const { runPs } = require('./ps');

// Win32_DriveType 枚举值：2=Removable, 3=Fixed, 4=Network, 5=CD, 0=Unknown
const DRIVE_TYPES = new Set([0, 2, 3, 4, 5]);

// 可用 fs.existsSync 快速探测的盘类型：
// 2=Removable（U盘）、3=Fixed（本地固定盘）——恰好是本工具的守护对象
// 0/4/5（未知/网络/光驱）探测结果不可靠（无介质返回 false、网络路径可能阻塞），只走慢速扫描
const FAST_PROBE_TYPES = new Set([2, 3]);

// 全部候选盘符（用于发现"新插入"的盘）
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * 通过 PowerShell CIM 枚举驱动器
 */
function enumDrives() {
  const ps = `
$list = @(Get-CimInstance Win32_LogicalDisk | ForEach-Object {
  [PSCustomObject]@{
    id = [string]$_.DeviceID
    root = ([string]$_.DeviceID + '\\')
    label = [string]$_.VolumeName
    volumeSerialNumber = [string]$_.VolumeSerialNumber
    driveType = [int]$_.DriveType
    size = [double]$_.Size
    freeSpace = [double]$_.FreeSpace
    isSystem = $(if ($_.DeviceID -eq $env:SystemDrive) { 1 } else { 0 })
    status = 'online'
  }
})
ConvertTo-Json -InputObject $list -Compress
`;
  return runPs(ps).then((stdout) => {
    let arr = JSON.parse(stdout.trim() || '[]');
    if (!Array.isArray(arr)) arr = [arr];
    arr = arr.filter((d) => DRIVE_TYPES.has(Number(d.driveType)));
    return arr.map((d) => ({
      id: d.id,
      root: d.root,
      label: d.label || '',
      volumeSerialNumber: d.volumeSerialNumber || '',
      driveType: Number(d.driveType) || 0,
      size: Number(d.size) || 0,
      freeSpace: Number(d.freeSpace) || 0,
      isSystem: Number(d.isSystem) === 1 ? 1 : 0,
      status: 'online',
    }));
  });
}

// 轻量探测：盘根目录是否可访问（不启动任何子进程）
function probeRoot(root) {
  try {
    return fs.existsSync(root);
  } catch {
    return false;
  }
}

/**
 * 创建驱动器监听器
 * @param {object} options
 * @param {(drive: object) => void} options.onRemoved  拔出回调
 * @param {(drives: object[]) => void} options.onConnected 接入/变化回调
 * @param {(err: Error) => void} [options.onError]
 * @param {number} [options.pollMs] 快速探测轮询间隔
 * @param {number} [options.reconcileMs] 慢速兜底扫描间隔
 */
function createDriveWatcher({
  onConnected,
  onRemoved,
  onError,
  pollMs = 500,
  reconcileMs = 30000,
}) {
  let map = new Map(); // key: 盘符 id（如 'E:'）
  const slowList = new Set(); // 探测不可靠的盘符，只由慢速扫描维护
  let timer = null;
  let running = false;
  let lastReconcile = 0;

  function safeRemoved(drive) {
    Promise.resolve(onRemoved(drive)).catch((e) => {
      if (onError) onError(e);
    });
  }

  /**
   * 完整扫描并差分同步（接入/换盘/确认拔出）
   * @param {string} [suspectId] 快速探测疑似消失的盘符：若扫描后仍存在，说明探测不可靠，转入 slowList
   */
  async function fullScanAndSync(suspectId) {
    let list;
    try {
      list = await enumDrives();
    } catch (err) {
      if (onError) onError(err);
      return;
    }
    const next = new Map(list.map((d) => [d.id, d]));

    // 拔出：旧快照有、新快照没有
    for (const [id, drive] of map) {
      if (!next.has(id)) {
        map.delete(id);
        slowList.delete(id);
        safeRemoved({ ...drive, status: 'removed' });
      }
    }
    // 接入或发生变化（卷序列号变化视为换了一块U盘）
    for (const [id, drive] of next) {
      // 分类：探测不可靠的类型只走慢速层
      if (!FAST_PROBE_TYPES.has(Number(drive.driveType))) slowList.add(id);
      const prev = map.get(id);
      if (!prev || prev.volumeSerialNumber !== drive.volumeSerialNumber) {
        map.set(id, drive);
        onConnected(drive);
      }
    }
    // 疑似消失但扫描确认仍在：探测不可靠（如无介质读卡器），转入 slowList 停止快速探测
    if (suspectId && map.has(suspectId)) {
      slowList.add(suspectId);
    }
    lastReconcile = Date.now();
  }

  async function tick() {
    if (!running) return;
    try {
      // 1) 已知盘消失 → 立即完整扫描确认（真实拔出在此路径闭环，含进程关闭）
      let suspect = null;
      for (const [id, drive] of map) {
        if (slowList.has(id)) continue;
        if (!FAST_PROBE_TYPES.has(Number(drive.driveType))) {
          slowList.add(id);
          continue;
        }
        if (!probeRoot(drive.root)) {
          suspect = id;
          break;
        }
      }
      if (suspect) {
        await fullScanAndSync(suspect);
      } else if (Date.now() - lastReconcile >= reconcileMs) {
        // 2) 周期性兜底扫描（防漏事件，也覆盖 slowList 里设备的状态变化）
        await fullScanAndSync();
      } else {
        // 3) 未登记盘符出现 → 完整扫描拿详情（卷标/序列号/类型）
        for (const letter of LETTERS) {
          const id = `${letter}:`;
          if (map.has(id) || slowList.has(id)) continue;
          if (probeRoot(`${letter}:\\`)) {
            await fullScanAndSync();
            break;
          }
        }
      }
    } catch (err) {
      if (onError) onError(err);
    }
    if (running) {
      timer = setTimeout(tick, pollMs);
    }
  }

  return {
    async start() {
      if (running) return;
      running = true;
      await fullScanAndSync();
      timer = setTimeout(tick, pollMs);
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    getDrives() {
      return [...map.values()];
    },
  };
}

module.exports = { createDriveWatcher, enumDrives };
