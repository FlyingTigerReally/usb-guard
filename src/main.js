/**
 * Electron 主进程入口
 * ---------------------------------------------------------------
 * 职责：创建窗口 / 托盘 / IPC / 启动守护服务
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, powerMonitor, Notification, shell } = require('electron');
const path = require('path');
const settings = require('./services/settings');
const { createGuardService } = require('./services/guardService');
const { t, setLocale, getLocale, LOCALE_OPTIONS, LOCALES } = require('./i18n');

// 图标资源（由 scripts/generate-icons.js 从 SVG 原稿生成）
const ICONS_DIR = path.join(__dirname, '..', 'assets', 'icons');
const APP_ICON = path.join(ICONS_DIR, 'app-256.png'); // 窗口/任务栏
const TRAY_ICON = path.join(ICONS_DIR, 'tray-32.png'); // 系统托盘（16x16@2x）

let mainWindow = null;
let tray = null;
let guard = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    title: t('app.windowTitle'),
    icon: APP_ICON,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 配置：关窗仅最小化到托盘（守护常驻）
  mainWindow.on('close', (e) => {
    if (settings.data.minimizeToTray === 1 && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: t('tray.show'),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: t('tray.exit'),
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(TRAY_ICON));
  tray.setToolTip(t('tray.tooltip'));
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
}

/**
 * 应用菜单栏（替换 Electron 默认菜单，文案走 i18n）
 */
function buildAppMenu() {
  const template = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.hideToTray'),
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            if (mainWindow) mainWindow.hide();
          },
        },
        { type: 'separator' },
        {
          label: t('menu.quit'),
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'selectAll', label: t('menu.selectAll') },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('menu.refreshSnapshot'),
          accelerator: 'F5',
          click: () => {
            if (guard) guard.refreshSnapshots();
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: t('menu.devTools') },
        { role: 'resetZoom', label: t('menu.zoomReset') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
      ],
    },
    {
      label: t('menu.window'),
      submenu: [
        {
          label: t('menu.showMain'),
          click: () => {
            if (mainWindow) {
              mainWindow.show();
              mainWindow.focus();
            }
          },
        },
        {
          label: t('menu.minimize'),
          role: 'minimize',
        },
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click: () => {
            // 自定义关于弹窗（渲染层），带可点击的仓库链接
            if (mainWindow) {
              mainWindow.show();
              mainWindow.webContents.send('app:showAbout');
            }
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * 开机自启动：写入/移除 Windows 登录项（注册表 Run 键）
 * @param {number} enabled 1 = 自启，0 = 取消自启
 */
function applyAutoLaunch(enabled) {
  const openAtLogin = enabled === 1;
  if (app.isPackaged) {
    // 打包后：直接注册安装目录下的 exe
    app.setLoginItemSettings({ openAtLogin });
  } else {
    // 开发模式：注册 electron.exe 并指向本项目入口
    app.setLoginItemSettings({
      openAtLogin,
      path: process.execPath,
      args: [app.getAppPath()],
    });
  }
}

function setupIpc() {
  ipcMain.handle('guard:getState', () => ({
    drives: guard.getDrives(),
    events: guard.getEvents(),
    settings: settings.data,
    locale: getLocale(),
    localeOptions: LOCALE_OPTIONS,
    version: app.getVersion(),
  }));

  // 用系统浏览器打开外链
  ipcMain.handle('app:openExternal', (_e, url) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) shell.openExternal(url);
  });

  // 取语言包（渲染层用它渲染界面文案）
  ipcMain.handle('app:getI18n', (_e, code) => ({
    pack: LOCALES[code] || LOCALES[getLocale()],
    locale: LOCALES[code] ? code : getLocale(),
    options: LOCALE_OPTIONS,
  }));

  // 切换界面语言：更新 i18n、重建菜单/托盘/窗口标题，并持久化
  ipcMain.handle('app:setLocale', (_e, code) => {
    const next = setLocale(code);
    settings.update({ language: next });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setTitle(t('app.windowTitle'));
    }
    if (tray) {
      tray.setToolTip(t('tray.tooltip'));
      tray.setContextMenu(buildTrayMenu());
    }
    buildAppMenu();
    return next;
  });

  ipcMain.handle('guard:setGuard', (_e, driveId, enabled) => {
    guard.setGuard(driveId, enabled);
    return guard.getDrives();
  });

  ipcMain.handle('guard:killAll', async (_e, driveId) => {
    return guard.killAllForDrive(driveId);
  });

  ipcMain.handle('guard:refresh', async () => {
    await guard.refreshSnapshots();
    return guard.getDrives();
  });

  ipcMain.handle('settings:update', (_e, patch) => {
    const result = settings.update(patch);
    // 自启动开关变化时同步写入/移除系统登录项
    if (patch.autoLaunch !== undefined) {
      applyAutoLaunch(patch.autoLaunch);
    }
    return result;
  });
}

/**
 * 锁屏警示：锁屏离开时U盘未拔，锁屏期间持续通知提醒
 * ---------------------------------------------------------------
 * Toast 通知会显示在 Windows 锁屏界面上（Win+L / 自动锁屏同样生效，
 * 需系统开启"在锁屏界面上显示通知"，默认开启）。
 */
function hasUsbDrive() {
  // 可移动磁盘（U盘），或用户手动守护的非系统盘
  return guard.getDrives().some(
    (d) => d.isSystem !== 1 && (Number(d.driveType) === 2 || d.enabled === 1)
  );
}

function setupLockAlert() {
  let notifyTimer = null;

  const stopNotify = () => {
    if (notifyTimer) {
      clearInterval(notifyTimer);
      notifyTimer = null;
    }
  };

  const sendLockNotification = () => {
    // 拔盘即停：发送前再检查一次，锁屏期间拔掉就不再提醒
    if (!hasUsbDrive()) {
      stopNotify();
      return;
    }
    const n = new Notification({
      title: t('notify.title'),
      body: t('notify.body'),
    });
    n.show();
  };

  powerMonitor.on('lock-screen', () => {
    if (settings.data.lockAlert !== 1) return;
    if (!hasUsbDrive()) return;
    sendLockNotification();
    // 间隔可在设置里调整（秒，5~600）
    const sec = Math.min(600, Math.max(5, Number(settings.data.lockAlertIntervalSec) || 30));
    notifyTimer = setInterval(sendLockNotification, sec * 1000);
  });

  powerMonitor.on('unlock-screen', stopNotify);
}

app.whenReady().then(() => {
  // 通知身份（与打包 appId 一致）：保证 Toast 通知正常弹出
  app.setAppUserModelId('com.local.usbguard');
  settings.init(app.getPath('userData'));
  // 语言优先级：用户配置 > 系统语言 > 英文
  const sysLocale = app.getLocale();
  setLocale(settings.data.language || (sysLocale && sysLocale.startsWith('zh') ? 'zh-CN' : 'en'));
  guard = createGuardService(settings.data);
  guard.onEvent((evt) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('guard:event', evt);
    }
  });

  createWindow();
  createTray();
  buildAppMenu();
  setupIpc();
  setupLockAlert();
  guard.start();

  // 启动时把配置里的自启状态同步到系统登录项（以配置为准）
  applyAutoLaunch(settings.data.autoLaunch);
});

app.on('window-all-closed', () => {
  // 常驻托盘，不随窗口关闭退出
  if (app.isQuitting) app.quit();
});

module.exports = { getMainWindow: () => mainWindow };
