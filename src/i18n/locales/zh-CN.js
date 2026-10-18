/**
 * 简体中文语言包
 * ---------------------------------------------------------------
 * 约定：
 * 1. key 采用点路径：<命名空间>.<名称>，与 en.js 保持一一对应；
 * 2. 占位符统一 {name}，由 i18n 解析器填充；
 * 3. 业务逻辑里不写死文案，一律走 t() 解析。
 */
module.exports = {
  // ---------- 应用外壳 ----------
  'app.title': 'USB Guard',
  'app.subtitle': 'U 盘拔出后立即关闭其启动的全部程序',
  'app.windowTitle': 'USB Guard - U盘拔出自动关闭程序',
  'tray.tooltip': 'USB Guard - U盘拔出自动关闭程序',
  'tray.show': '显示主界面',
  'tray.exit': '退出',
  'language.label': '语言',
  'theme.label': '主题',
  'theme.system': '跟随系统',
  'theme.light': '浅色',
  'theme.dark': '深色',

  // ---------- 应用菜单栏 ----------
  'menu.file': '文件',
  'menu.edit': '编辑',
  'menu.view': '查看',
  'menu.window': '窗口',
  'menu.help': '帮助',
  'menu.hideToTray': '隐藏到托盘',
  'menu.quit': '退出',
  'menu.undo': '撤销',
  'menu.redo': '重做',
  'menu.cut': '剪切',
  'menu.copy': '复制',
  'menu.paste': '粘贴',
  'menu.selectAll': '全选',
  'menu.refreshSnapshot': '刷新快照',
  'menu.devTools': '开发者工具',
  'menu.zoomReset': '实际大小',
  'menu.zoomIn': '放大',
  'menu.zoomOut': '缩小',
  'menu.showMain': '显示主界面',
  'menu.minimize': '最小化',
  'menu.about': '关于 USB Guard',

  // ---------- 关于弹窗 ----------
  'about.title': '关于 USB Guard',
  'about.message': 'USB Guard - U盘拔出自动关闭程序',
  'about.detail':
    '版本 1.1.0\n\n检测 U 盘拔出后，自动关闭从该 U 盘启动的全部程序。\n数据来源：Windows 本地系统 API。',
  'about.ok': '确定',

  // ---------- 仪表读数 ----------
  'stat.guarded': '守护中',
  'stat.drives': '个驱动器',
  'stat.processes': '已追踪进程',
  'stat.procsUnit': '个',
  'stat.events': '事件记录',
  'stat.eventsUnit': '条',
  'stat.watching': '驱动器监听运行中',

  // ---------- 面板 ----------
  'panel.drives': '驱动器列表',
  'panel.drivesHint': '开关决定该盘拔出时是否自动关闭程序',
  'panel.settings': '设置',
  'panel.events': '事件日志',
  'panel.eventsCount': '{count} 条',
  'panel.processDetail': '进程明细',

  // ---------- 按钮 ----------
  'btn.refresh': '刷新快照',
  'btn.settings': '设置',
  'btn.refreshing': '刷新中…',
  'btn.close': '关闭',
  'btn.killAll': '立即关闭该盘全部程序',
  'btn.killing': '关闭中…',
  'btn.detail': '明细',

  // ---------- 驱动器卡片 ----------
  'drive.systemDisk': '系统盘',
  'drive.guarding': '守护中',
  'drive.notGuarding': '未守护',
  'drive.noLabel': '未命名',
  'drive.meta': '{id} · {type} · {size} · 相关进程 {count} 个',

  // ---------- 驱动器类型（Windows Win32_DriveType） ----------
  'driveType.unknown': '未知',
  'driveType.removable': '可移动磁盘',
  'driveType.fixed': '固定磁盘',
  'driveType.network': '网络盘',
  'driveType.cd': '光驱',

  // ---------- 设置 ----------
  'settings.killChildren': '连同子进程一起关闭（推荐）',
  'settings.autoGuard': '检测到可移动磁盘（U盘）时自动开启守护',
  'settings.minimizeToTray': '关闭窗口时最小化到托盘（常驻守护）',
  'settings.autoLaunch': '开机自动启动本守护',
  'settings.scene3d': '3D 背景样式',
  'scene.core': '守护核心',
  'scene.nebula': '粒子星云',
  'scene.off': '关闭',

  // ---------- 空状态 ----------
  'empty.noDrives': '未检测到非系统驱动器',
  'empty.noEvents': '暂无事件',
  'empty.noProcesses': '该盘暂无已登记进程\n（进程快照会周期刷新）',

  // ---------- 进程行 ----------
  'proc.pid': 'PID {pid}',

  // ---------- 事件 ----------
  'evt.drive_connected': '检测到驱动器 {id}{label}',
  'evt.drive_removed': '驱动器 {id}{label} 已拔出',
  'evt.guard_enabled': '已开启 {id} 的U盘拔出守护',
  'evt.guard_disabled': '已关闭 {id} 的U盘拔出守护',
  'evt.snapshot_updated': '{id} 进程快照已更新，共 {count} 个相关进程',
  'evt.kill_dispatched': '驱动器 {id} 已拔出，正在关闭 {count} 个相关进程…',
  'evt.process_killed': '已关闭 {name} (PID {pid})',
  'evt.process_kill_failed': '关闭 {name} (PID {pid}) 失败：{error}',
  'evt.kill_skipped': '驱动器 {id} 未开启守护，跳过关闭',
  'evt.no_tracked_process': '驱动器 {id} 无已登记进程',
  'evt.watch_paused': '守护已暂停',
  'evt.watch_error': '轮询出错：{error}',
  'evt.watch_start_failed': '驱动器枚举启动失败：{error}',
};
