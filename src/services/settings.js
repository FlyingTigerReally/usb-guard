/**
 * 设置持久化：读写 userData/settings.json
 */
const fs = require('fs');
const path = require('path');

// ============ 配置项默认值（详细说明见注释） ============
const DEFAULTS = {
  // 1 = 关闭进程时连同其子进程一起关闭（taskkill /T），0 = 仅关闭扫描到的进程
  // 说明：从U盘启动的软件往往会拉起若干子进程，建议保持 1，保证"相关程序全部关闭"
  killChildren: 1,

  // 1 = 检测到"可移动磁盘"（driveType=2）时自动开启监控，0 = 全部由用户手动开启
  // 说明：部分U盘（尤其NTFS格式化的）会被识别为固定磁盘(3)，此类仍需手动勾选
  autoGuardRemovable: 1,

  // 进程快照扫描间隔（毫秒）。越小→界面进程计数越实时，但常驻 CPU/IO 越高
  // 说明：每次扫描都要 spawn 一个 PowerShell，是最大的常驻开销来源；
  //       拔出时另有“按需扫描”兜底，所以此值可适当放大而不漏进程
  // 建议范围 2000 ~ 10000
  snapshotIntervalMs: 5000,

  // 拔出检测轮询间隔（毫秒）。拔盘后多久发现，直接决定"关闭"的及时性
  // 建议范围 300 ~ 1000
  removePollMs: 500,

  // 事件日志最大保留条数（内存中）
  maxEvents: 500,

  // 1 = 主界面关闭按钮仅最小化到托盘（守护常驻），0 = 直接退出应用
  minimizeToTray: 1,

  // 1 = 开机自启动（Windows 登录后自动运行本守护），0 = 不自启
  // 说明：打包为 exe 后注册的是安装目录的程序；开发模式下注册的是 electron.exe
  autoLaunch: 1,

  // 界面语言：'en' = English，'zh-CN' = 简体中文
  // 说明：取值为英文语言码，不做中文判断
  language: 'en',
};

let data = { ...DEFAULTS };
let filePath = null;

function init(userDataDir) {
  filePath = path.join(userDataDir, 'settings.json');
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      // 仅接受已知配置项，防止脏数据污染
      for (const key of Object.keys(DEFAULTS)) {
        if (raw[key] !== undefined) data[key] = raw[key];
      }
    }
  } catch (err) {
    // 配置损坏时回落默认值
    data = { ...DEFAULTS };
  }
  return data;
}

function save() {
  if (!filePath) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    // 写入失败不阻断主流程
  }
}

function update(patch) {
  for (const key of Object.keys(DEFAULTS)) {
    if (patch[key] !== undefined) data[key] = patch[key];
  }
  save();
  return data;
}

module.exports = { DEFAULTS, init, update, save, get data() { return data; } };
