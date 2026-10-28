/**
 * English language pack (source of truth for i18n keys)
 * ---------------------------------------------------------------
 * Conventions:
 * 1. Keys are grouped by dot path: <namespace>.<name>;
 * 2. Placeholders use {name} and are filled by the i18n resolver;
 * 3. Never put UI text in business logic — always resolve through t().
 */
module.exports = {
  // ---------- App shell ----------
  'app.title': 'USB Guard',
  'app.subtitle': 'Auto-close programs launched from a USB drive once it is unplugged',
  'app.windowTitle': 'USB Guard - Auto-close USB programs on unplug',
  'tray.tooltip': 'USB Guard - Auto-close USB programs on unplug',
  'tray.show': 'Show main window',
  'tray.exit': 'Exit',
  'language.label': 'Language',
  'theme.label': 'Theme',
  'theme.system': 'Follow system',
  'theme.light': 'Light',
  'theme.dark': 'Dark',

  // ---------- Application menu ----------
  'menu.file': 'File',
  'menu.edit': 'Edit',
  'menu.view': 'View',
  'menu.window': 'Window',
  'menu.help': 'Help',
  'menu.hideToTray': 'Hide to Tray',
  'menu.quit': 'Quit',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',
  'menu.cut': 'Cut',
  'menu.copy': 'Copy',
  'menu.paste': 'Paste',
  'menu.selectAll': 'Select All',
  'menu.refreshSnapshot': 'Refresh Snapshot',
  'menu.devTools': 'Toggle Developer Tools',
  'menu.zoomReset': 'Actual Size',
  'menu.zoomIn': 'Zoom In',
  'menu.zoomOut': 'Zoom Out',
  'menu.showMain': 'Show Main Window',
  'menu.minimize': 'Minimize',
  'menu.about': 'About USB Guard',

  // ---------- About dialog ----------
  'about.title': 'About USB Guard',
  'about.detail': 'Auto-close every program launched from a USB drive the moment it is unplugged.\nData source: local Windows system APIs.',
  'about.repo': 'Repository',
  'about.ok': 'OK',

  // ---------- Readout ----------
  'stat.guarded': 'Guarded',
  'stat.drives': 'drives',
  'stat.processes': 'Tracked processes',
  'stat.procsUnit': 'procs',
  'stat.events': 'Event log',
  'stat.eventsUnit': 'entries',
  'stat.watching': 'Drive watch active',

  // ---------- Panels ----------
  'panel.drives': 'Drives',
  'panel.drivesHint': 'Toggle to decide whether programs are closed when this drive is removed',
  'panel.settings': 'Settings',
  'panel.events': 'Event Log',
  'panel.eventsCount': '{count} entries',
  'panel.processDetail': 'Process Detail',

  // ---------- Buttons ----------
  'btn.refresh': 'Refresh Snapshot',
  'btn.settings': 'Settings',
  'btn.refreshing': 'Refreshing…',
  'btn.close': 'Close',
  'btn.killAll': 'Force-close all programs on this drive',
  'btn.killing': 'Closing…',
  'btn.detail': 'Detail',

  // ---------- Drive card ----------
  'drive.systemDisk': 'System',
  'drive.guarding': 'Guarded',
  'drive.notGuarding': 'Not guarded',
  'drive.noLabel': 'Untitled',
  'drive.meta': '{id} · {type} · {size} · {count} related processes',

  // ---------- Drive types (Windows Win32_DriveType) ----------
  'driveType.unknown': 'Unknown',
  'driveType.removable': 'Removable disk',
  'driveType.fixed': 'Local disk',
  'driveType.network': 'Network drive',
  'driveType.cd': 'Optical drive',

  // ---------- Settings ----------
  'settings.killChildren': 'Also force-close child processes (recommended)',
  'settings.autoGuard': 'Auto-guard removable disks (USB drives) when detected',
  'settings.minimizeToTray': 'Minimize to tray when the window is closed (stay resident)',
  'settings.autoLaunch': 'Launch this guard automatically at login',
  'settings.scene3d': '3D background',
  'settings.lockAlert': 'Keep notifying on the lock screen if a USB drive is left plugged in while locked',
  'settings.lockInterval': 'Notify interval (seconds)',
  'scene.core': 'Guard Core',
  'scene.nebula': 'Nebula',
  'scene.off': 'Off',

  // ---------- Lock alert ----------
  'notify.title': 'USB Drive Alert',
  'notify.body': 'The computer is locked and a USB drive is still plugged in. Please unplug it.',

  // ---------- Empty states ----------
  'empty.noDrives': 'No non-system drives detected',
  'empty.noEvents': 'No events yet',
  'empty.noProcesses': 'No tracked processes on this drive\n(the process snapshot refreshes periodically)',

  // ---------- Process row ----------
  'proc.pid': 'PID {pid}',

  // ---------- Events ----------
  'evt.drive_connected': 'Drive {id}{label} connected',
  'evt.drive_removed': 'Drive {id}{label} removed',
  'evt.guard_enabled': 'USB unplug guard enabled for {id}',
  'evt.guard_disabled': 'USB unplug guard disabled for {id}',
  'evt.snapshot_updated': '{id} process snapshot updated: {count} related processes',
  'evt.kill_dispatched': 'Drive {id} removed, force-closing {count} related processes…',
  'evt.process_killed': 'Closed {name} (PID {pid})',
  'evt.process_kill_failed': 'Failed to close {name} (PID {pid}): {error}',
  'evt.kill_skipped': 'Drive {id} is not guarded, skipping close',
  'evt.no_tracked_process': 'No tracked processes on drive {id}',
  'evt.watch_paused': 'Guard paused',
  'evt.watch_error': 'Polling error: {error}',
  'evt.watch_start_failed': 'Failed to enumerate drives: {error}',
};
