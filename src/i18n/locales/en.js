/**
 * English language pack (source of truth for i18n keys)
 * ---------------------------------------------------------------
 * Conventions:
 * 1. Keys are grouped by dot path: <namespace>.<name>;
 * 2. Placeholders use {name} and are filled by the i18n resolver;
 * 3. Never put UI text in business logic — always resolve through t().
 */
module.exports = {
  "workspace.label": "Your devices. In safe hands.",
  "hero.ready": "ALWAYS ON YOUR SIDE",
  "hero.protecting": "PROTECTION IS IN PLACE",
  "hero.line1": "Unplug.",
  "hero.line2": "Leave no trace.",
  "hero.interact": "Move to explore",
  "stat.guardedHint": "Programs close on removal",
  "stat.processHint": "Everything accounted for",
  "stat.eventHint": "A record of every action",
  "stat.waiting": "Listening for drives",
  "stat.watchError": "Drive watch error — check the log",
  "filter.all": "All drives",
  "filter.guarded": "Guarded",
  "filter.usb": "USB",
  "filter.errors": "Errors only",
  "btn.export": "Export log ↗",
  "drive.processCount": "{count} processes",
  "drive.capacity": "{free} free / {total}",
  "drive.toggle": "Toggle removal protection for {id}",
  "empty.noMatchingDrives": "No drives in this category.",
  "empty.noErrors": "All clear. No errors to report.",
  "footer.local": "On your device. Under your control.",
  "scene.pause": "Pause animation",
  "scene.resume": "Resume animation",
  "window.maximize": "Maximize",
  "window.restore": "Restore window",
  "feedback.exported": "Event log exported",
  "feedback.failed": "Operation failed. Try again or check the log.",
  // ---------- App shell ----------
  "app.title": "USB Guard",
  "app.subtitle":
    "Auto-close programs launched from a USB drive once it is unplugged",
  "app.windowTitle": "USB Guard - Auto-close USB programs on unplug",
  "tray.tooltip": "USB Guard - Auto-close USB programs on unplug",
  "tray.show": "Show main window",
  "tray.exit": "Exit",
  "language.label": "Language",
  "theme.label": "Theme",
  "theme.system": "Follow system",
  "theme.light": "Light",
  "theme.dark": "Dark",

  // ---------- Application menu ----------
  "menu.file": "File",
  "menu.edit": "Edit",
  "menu.view": "View",
  "menu.window": "Window",
  "menu.help": "Help",
  "menu.hideToTray": "Hide to Tray",
  "menu.quit": "Quit",
  "menu.undo": "Undo",
  "menu.redo": "Redo",
  "menu.cut": "Cut",
  "menu.copy": "Copy",
  "menu.paste": "Paste",
  "menu.selectAll": "Select All",
  "menu.refreshSnapshot": "Refresh Snapshot",
  "menu.devTools": "Toggle Developer Tools",
  "menu.zoomReset": "Actual Size",
  "menu.zoomIn": "Zoom In",
  "menu.zoomOut": "Zoom Out",
  "menu.showMain": "Show Main Window",
  "menu.minimize": "Minimize",
  "menu.about": "About USB Guard",

  // ---------- About dialog ----------
  "about.title": "About USB Guard",
  "about.detail":
    "Auto-close every program launched from a USB drive the moment it is unplugged.\nData source: local Windows system APIs.",
  "about.repo": "Repository",
  "about.ok": "OK",

  // ---------- Readout ----------
  "stat.guarded": "Guarded",
  "stat.drives": "drives",
  "stat.processes": "Tracked processes",
  "stat.procsUnit": "procs",
  "stat.events": "Event log",
  "stat.eventsUnit": "entries",
  "stat.watching": "Drive watch active",

  // ---------- Panels ----------
  "panel.drives": "Drives",
  "panel.drivesHint":
    "Toggle to decide whether programs are closed when this drive is removed",
  "panel.settings": "Settings",
  "panel.events": "Event Log",
  "panel.eventsCount": "{count} entries",
  "panel.processDetail": "Process Detail",

  // ---------- Buttons ----------
  "btn.refresh": "Refresh Snapshot",
  "btn.settings": "Settings",
  "btn.refreshing": "Refreshing…",
  "btn.close": "Close",
  "btn.killAll": "Force-close all programs on this drive",
  "btn.killing": "Closing…",
  "btn.detail": "Detail",

  // ---------- Drive card ----------
  "drive.systemDisk": "System",
  "drive.guarding": "Guarded",
  "drive.notGuarding": "Not guarded",
  "drive.noLabel": "Untitled",
  "drive.meta": "{id} · {type} · {size} · {count} related processes",

  // ---------- Drive types (Windows Win32_DriveType) ----------
  "driveType.unknown": "Unknown",
  "driveType.removable": "Removable disk",
  "driveType.fixed": "Local disk",
  "driveType.network": "Network drive",
  "driveType.cd": "Optical drive",

  // ---------- Settings ----------
  "settings.killChildren": "Also force-close child processes (recommended)",
  "settings.autoGuard": "Auto-guard removable disks (USB drives) when detected",
  "settings.minimizeToTray":
    "Minimize to tray when the window is closed (stay resident)",
  "settings.autoLaunch": "Launch this guard automatically at login",
  "settings.scene3d": "3D background",
  "settings.lockAlert":
    "Keep notifying on the lock screen if a USB drive is left plugged in while locked",
  "settings.lockInterval": "Notify interval (seconds)",
  "scene.core": "Particle valley",
  "scene.nebula": "Guard team",
  "scene.off": "Off",

  // ---------- Lock alert ----------
  "notify.title": "USB Drive Alert",
  "notify.body":
    "The computer is locked and a USB drive is still plugged in. Please unplug it.",

  // ---------- Empty states ----------
  "empty.noDrives": "No non-system drives detected",
  "empty.noEvents": "No events yet",
  "empty.noProcesses":
    "No tracked processes on this drive\n(the process snapshot refreshes periodically)",

  // ---------- Process row ----------
  "proc.pid": "PID {pid}",

  // ---------- Events ----------
  "evt.drive_connected": "Drive {id}{label} connected",
  "evt.drive_removed": "Drive {id}{label} removed",
  "evt.guard_enabled": "USB unplug guard enabled for {id}",
  "evt.guard_disabled": "USB unplug guard disabled for {id}",
  "evt.snapshot_updated":
    "{id} process snapshot updated: {count} related processes",
  "evt.kill_dispatched":
    "Drive {id} removed, force-closing {count} related processes…",
  "evt.process_killed": "Closed {name} (PID {pid})",
  "evt.process_kill_failed": "Failed to close {name} (PID {pid}): {error}",
  "evt.kill_skipped": "Drive {id} is not guarded, skipping close",
  "evt.no_tracked_process": "No tracked processes on drive {id}",
  "evt.watch_paused": "Guard paused",
  "evt.watch_error": "Polling error: {error}",
  "evt.watch_start_failed": "Failed to enumerate drives: {error}",
  "nav.devices": "Devices",
  "nav.experience": "Guard universe",
  "btn.explore": "Explore the universe",
  "chapter.valley": "Valley",
  "chapter.team": "Team",
  "chapter.tunnel": "Tunnel",
  "chapter.glass": "Glass",
  "exp.valley.title": "Every signal.\nA world to protect.",
  "exp.valley.desc": "A field of connections. One guardian watching over them.",
  "exp.scroll": "Scroll to travel",
  "exp.team.title": "Three roles.\nOne promise.",
  "exp.team.desc":
    "Detect. Track. Close. Meet the three parts of your local protection.",
  "team.scout": "Scout",
  "team.scout.desc": "Drive detection",
  "team.tracker": "Tracker",
  "team.tracker.desc": "Process snapshots",
  "team.cleaner": "Closer",
  "team.cleaner.desc": "Process cleanup",
  "exp.tunnel.title": "Follow the signal.",
  "exp.tunnel.desc":
    "Scroll through the data tunnel. Protection follows your drive.",
  "exp.astronaut.title": "Go anywhere.\nStay connected.",
  "exp.astronaut.desc":
    "A little explorer for your portable world. Move your pointer to change perspective.",
  "exp.glass.title": "A transparent\nline of defense.",
  "exp.glass.desc":
    "Scroll to open the glass shield. Your settings stay visible. Your data stays local.",
  "exp.cap.title": "Small tool.\nFull attention.",
  "cap.detect": "Listen to every connection",
  "cap.detect.desc":
    "Automatically guard removable drives as soon as they appear.",
  "cap.configure": "Configure ↗",
  "cap.track": "Know the whole process tree",
  "cap.track.desc":
    "Track executable paths and include child processes in cleanup.",
  "cap.stay": "Quietly keep watch",
  "cap.stay.desc":
    "Stay in the tray, start with Windows and remind you while locked.",
  "exp.awards.title": "Protection,\nworth a badge.",
  "exp.awards.desc":
    "Your current protection, celebrated. These badges reflect this device and this session.",
  "award.local": "Local by design",
  "award.local.desc": "No account. No cloud service.",
  "award.guard": "Under your protection",
  "award.guard.desc": "Drives guarded right now",
  "award.closed": "Clean exits",
  "award.closed.desc": "Processes closed in the current event history",
  "btn.return": "Back to devices",
  "footer.hint": "PROTECT WHAT MOVES WITH YOU",
  "log.live": "Live · up to 500 recent events, 100 shown",
  "settings.tab.protection": "Protection",
  "settings.tab.appearance": "Appearance",
  "settings.tab.system": "System",
  "settings.local": "Your preferences stay on this computer.",
  "settings.protection.title": "Your rules.\nOur watch.",
  "settings.protection.desc":
    "Choose how your drives and their programs are protected.",
  "settings.autoGuard.title": "Automatic protection",
  "settings.killChildren.title": "Close the whole tree",
  "settings.protection.note":
    "Removal protection force-closes registered programs. Save your work before unplugging.",
  "settings.appearance.title": "A little more you.",
  "settings.appearance.desc": "Tune the atmosphere, motion and visual detail.",
  "settings.motion.title": "Continuous animation",
  "settings.pointer.title": "Liquid pointer trail",
  "settings.pointer.desc":
    "Transparent fluid with mint and blue edges that follows your pointer.",
  "panel.cardView": "Card view",
  "settings.motion.desc":
    "Pointer and scroll still respond when animation is paused.",
  "settings.quality": "Visual quality",
  "quality.low": "Low",
  "quality.balanced": "Balanced",
  "quality.high": "High",
  "settings.system.title": "Quietly.\nAlways there.",
  "settings.system.desc": "Decide how USB Guard fits into your day.",
  "settings.tray.title": "Keep watch in the tray",
  "settings.start.title": "Start with Windows",
  "settings.lock.title": "A reminder before you leave",
  "settings.saved": "Changes are saved automatically",
  "log.search": "Search events or status…",
  "empty.noSearch": "No events match your search.",
  "scene.tunnel": "Data tunnel",
  "scene.glass": "Glass shield",
};
