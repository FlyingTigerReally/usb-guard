/**
 * 进程守护服务
 * ---------------------------------------------------------------
 * 职责：
 * 1. 扫描"指定驱动器目录下启动的进程"（匹配可执行文件路径前缀）；
 * 2. 维护已登记的进程快照（含子进程扩展）；
 * 3. 驱动器拔出时，关闭快照内的全部相关进程（taskkill /T /F）。
 */
const { execFile } = require('child_process');
const { runPs } = require('./ps');

const TASKKILL = 'taskkill.exe';

/**
 * 获取全系统进程表（单一 JSON 输出，避免跨 PowerShell 调用编码/转义问题）
 * source 字段：'exePath' = 从路径判定；'commandLine' = 从命令行判定（exePath 为空的宿主进程）
 */
function scanAllProcesses() {
  const ps = `
$ErrorActionPreference='SilentlyContinue'
$list = @(Get-CimInstance Win32_Process | ForEach-Object {
  $exe = ''
  try { $exe = [string]$_.ExecutablePath } catch {}
  $cl  = [string]$_.CommandLine
  $src = ''
  if ($exe) { $src = 'exePath' } elseif ($cl) { $src = 'commandLine' }
  if (-not $src) { return }
  [PSCustomObject]@{
    pid = [int]$_.ProcessId
    parentPid = [int]$_.ParentProcessId
    name = [string]$_.Name
    exePath = $exe
    commandLine = $cl
    source = $src
  }
})
ConvertTo-Json -InputObject $list -Compress
`;
  return runPs(ps).then((stdout) => {
    let arr = JSON.parse(stdout.trim() || '[]');
    if (!Array.isArray(arr)) arr = [arr];
    return arr;
  });
}

/**
 * 扫描"从指定驱动器启动的进程"
 * @param {string} driveId  盘符，如 'E:'
 * @param {string} volumeSerialNumber 卷序列号（U盘唯一标识，换盘识别）
 * @param {Array} [allProcesses] 可选，直接传入进程表（用于共享一次扫描）
 */
async function scanDriveProcesses(driveId, volumeSerialNumber, allProcesses) {
  const prefix = (driveId.endsWith('\\') ? driveId : driveId + '\\').toLowerCase();
  let all = allProcesses;
  if (!all) {
    try {
      all = await scanAllProcesses();
    } catch {
      return [];
    }
  }
  return all
    .filter((p) => {
      const exe = (p.exePath || '').toLowerCase();
      if (exe && exe.startsWith(prefix)) return true;
      const cl = p.commandLine || '';
      const re = new RegExp(
        `(^|[\\s"'])${driveId.replace(/([\\^$*+?.()|[\]{}])/g, '\\$1')}[\\\\/]`,
        'i'
      );
      return re.test(cl);
    })
    .map((p) => ({
      pid: p.pid,
      parentPid: p.parentPid,
      name: p.name,
      exePath: p.exePath,
      source: p.source,
    }));
}

/**
 * 构建进程快照：扫描结果 + 同盘路径的子进程（递归，防止漏掉子进程）
 */
function buildSnapshot(baseline, allProcesses) {
  const byPid = new Map(allProcesses.map((p) => [p.pid, p]));
  const byParent = new Map();
  for (const p of allProcesses) {
    if (!byParent.has(p.parentPid)) byParent.set(p.parentPid, []);
    byParent.get(p.parentPid).push(p);
  }
  const found = new Map();
  for (const p of baseline) found.set(p.pid, p);

  const queue = baseline.map((p) => p.pid);
  while (queue.length) {
    const pid = queue.shift();
    const children = byParent.get(pid) || [];
    for (const child of children) {
      if (found.has(child.pid)) continue;
      const exe = (child.exePath || '').toLowerCase();
      const rootExe = (byPid.get(pid) && byPid.get(pid).exePath) || '';
      const rootPrefix = rootExe ? rootExe.slice(0, 3) : '';
      // 子进程若也在同盘路径下，纳入快照
      if (rootPrefix && exe.startsWith(rootPrefix)) {
        found.set(child.pid, {
          pid: child.pid,
          parentPid: child.parentPid,
          name: child.name,
          exePath: child.exePath,
          source: child.source,
        });
        queue.push(child.pid);
      }
    }
  }
  return [...found.values()];
}

/**
 * 强制关闭一组进程
 * @param {number[]} pids
 * @param {boolean} killChildren 1 = 连同子进程一起关闭
 * @returns {Promise<Array<{pid:number, ok:1|0, error:string}>>}
 */
function killProcesses(pids, killChildren) {
  return Promise.all(
    pids.map(
      (pid) =>
        new Promise((resolve) => {
          const args = ['/PID', String(pid), '/F'];
          if (killChildren) args.push('/T');
          execFile(TASKKILL, args, { windowsHide: true }, (err) => {
            resolve(err ? { pid, ok: 0, error: err.message } : { pid, ok: 1, error: '' });
          });
        })
    )
  );
}

module.exports = {
  scanAllProcesses,
  scanDriveProcesses,
  buildSnapshot,
  killProcesses,
};
