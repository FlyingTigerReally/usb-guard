/** Integration check: real Electron window/preload/IPC; isolated fake drives, no OS guard actions. */
const { app, BrowserWindow, Menu, dialog } = require("electron");
// Verification needs the window visually un-occluded: Chromium marks occluded
// windows hidden, which by design suspends the pointer overlay and RAF chains.
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert/strict");
const root = path.resolve(__dirname, "..");
const fallback = process.argv.includes("--verify-no-webgl");
const langArg = process.argv.find((a) => a.startsWith("--lang="));
const lang = langArg ? langArg.slice("--lang=".length) : "zh-CN";
const shotPrefix = lang.startsWith("zh") ? "zh-" : "en-";
if (fallback) {
  const Module = require("module");
  const load = Module._load;
  const electron = require("electron");
  Module._load = function (request, parent, isMain) {
    if (request === "electron")
      return {
        ...electron,
        BrowserWindow: class extends BrowserWindow {
          constructor(options) {
            super({
              ...options,
              webPreferences: { ...options.webPreferences, webgl: false },
            });
          }
        },
      };
    return load.call(this, request, parent, isMain);
  };
}
const output = path.join(
  root,
  "verification",
  ...(fallback ? ["fallback"] : []),
);
fs.mkdirSync(output, { recursive: true });
fs.rmSync(path.join(output,"failure.txt"),{force:true});
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "usb-guard-ui-"));
app.setPath("userData", userData);
app.setLoginItemSettings = () => {}; // Verification never modifies login items.
app.getVersion = () => require("../package.json").version;
const settings = require("../src/services/settings");
settings.init(userData);
settings.update({
  autoLaunch: 0,
  language: lang,
  theme: "light",
  minimizeToTray: 1,
});
const gb = 1024 ** 3;
let drives = [
  {
    id: "E:",
    label: "PORTABLE",
    driveType: 2,
    size: 64 * gb,
    freeSpace: 42.8 * gb,
    enabled: 1,
    isSystem: 0,
    processCount: 2,
    processList: [
      { name: "Portable.exe", pid: 1234, exePath: "E:/Portable.exe" },
      { name: "Editor.exe", pid: 5678, exePath: "E:/Editor.exe" },
    ],
  },
  {
    id: "D:",
    label: "Workspace",
    driveType: 3,
    size: 512 * gb,
    freeSpace: 245 * gb,
    enabled: 0,
    isSystem: 0,
    processCount: 0,
    processList: [],
  },
  {
    id: "C:",
    label: "Windows",
    driveType: 3,
    size: 256 * gb,
    freeSpace: 120 * gb,
    enabled: 0,
    isSystem: 1,
    processCount: 0,
    processList: [],
  },
];
for (const [index, id] of ["F:", "G:", "H:", "I:", "J:", "K:"].entries())
  drives.push({
    id,
    label: ["ARCHIVE", "CAMERA", "BACKUP", "STUDIO", "TRAVEL", "MEDIA"][index],
    driveType: index % 2 ? 3 : 2,
    size: 128 * gb,
    freeSpace: (40 + index * 5) * gb,
    enabled: 0,
    isSystem: 0,
    processCount: 0,
    processList: [],
  });
let events = [
  {
    id: "1",
    timestamp: Date.now(),
    status: "snapshot_updated",
    ok: 1,
    params: { id: "E:", count: 2 },
  },
  {
    id: "2",
    timestamp: Date.now() - 1500,
    status: "guard_enabled",
    ok: 1,
    params: { id: "E:" },
  },
  {
    id: "3",
    timestamp: Date.now() - 3000,
    status: "drive_connected",
    ok: 1,
    params: { id: "E:", label: " (PORTABLE)" },
  },
  {
    id: "4",
    timestamp: Date.now() - 4000,
    status: "process_kill_failed",
    ok: 0,
    params: { name: "Old.exe", pid: 990, error: "Access denied" },
  },
];
let listener;
let refreshes = 0;
const servicePath = require.resolve("../src/services/guardService");
require.cache[servicePath] = {
  id: servicePath,
  filename: servicePath,
  loaded: true,
  exports: {
    createGuardService: () => ({
      getDrives: () => drives,
      getEvents: () => events,
      onEvent: (fn) => (listener = fn),
      start: () => {},
      setGuard: (id, enabled) => {
        drives.find((d) => d.id === id).enabled = enabled;
      },
      refreshSnapshots: async () => {
        refreshes++;
      },
      killAllForDrive: async () => ({ killed: 0 }),
    }),
  },
};
dialog.showSaveDialog = async () => ({
  canceled: false,
  filePath: path.join(output, "export-smoke.json"),
});
const checks = [];
const errors = [];
app.on("web-contents-created", (_e, contents) =>
  contents.on("console-message", (_e, level, message) => {
    if (
      level === 3 &&
      !(fallback && message.includes("Error creating WebGL context"))
    )
      errors.push(message);
  }),
);
const { getMainWindow } = require("../src/main");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  await app.whenReady();
  let win;
  for (let i = 0; i < 100; i++) {
    win = getMainWindow();
    if (win && !win.webContents.isLoading()) break;
    await wait(100);
  }
  assert(win);
  win.setAlwaysOnTop(true);
  const evaluate = async (code) => {
    try {
      return await win.webContents.executeJavaScript(code);
    } catch (e) {
      console.error("EVALUATION:", code);
      throw e;
    }
  };
  const click = (id) =>
    evaluate("document.getElementById(" + JSON.stringify(id) + ").click()");
  const shot = async (name) =>
    fs.promises.writeFile(
      path.join(output, shotPrefix + name + ".png"),
      (await win.webContents.capturePage()).toPNG(),
    );
  const sweep = async (cx = 350, cy = 540, name) => {
    for (let i = 0; i < 30; i++) {
      const angle = i * 0.55;
      win.webContents.sendInputEvent({type:"mouseMove", x:Math.round(cx+Math.cos(angle)*140), y:Math.round(cy+Math.sin(angle)*90)});
      await wait(35);
      if(i===26 && name) await shot(name);
    }
  };
  for (let i = 0; i < 100; i++) {
    if (
      await evaluate(
        'document.querySelectorAll(".drive-card").length===9 && !!document.documentElement.dataset.sceneReady',
      )
    )
      break;
    await wait(100);
  }
  await wait(500);
  assert.equal(Menu.getApplicationMenu(), null);
  checks.push("frameless custom menus");
  assert.equal(
    await evaluate('document.querySelectorAll(".drive-card").length'),
    9,
  );
  assert.equal(
    await evaluate('document.getElementById("statProcesses").textContent'),
    "2",
  );
  assert.equal(
    await evaluate('document.querySelector(".guard-toggle:disabled").disabled'),
    true,
  );
  checks.push("real preload, state and system-drive protection");
  assert.equal(
    await evaluate('document.body.classList.contains("no-webgl")'),
    fallback,
  );
  checks.push(
    fallback ? "WebGL fallback" : "independent GLSL pipeline compiled",
  );
  let visible = 0;
  for (let i = 0; i < 30; i++) {
    visible = await evaluate(
      '(()=>{const r=document.getElementById("driveList").getBoundingClientRect();return [...document.querySelectorAll(".drive-card")].filter(el=>{const c=el.getBoundingClientRect();return c.top>=r.top && c.bottom<=r.bottom}).length})()',
    );
    if (visible >= 6) break;
    await wait(100);
  }
  assert(
    visible >= 6,
    "six drive cards fully visible at default window: " + visible,
  );
  checks.push("six visible cards and independent drive scroll");
  await evaluate('document.getElementById("driveList").scrollTop=9999');
  assert(
    await evaluate(
      'document.querySelector("[data-drive="+CSS.escape("K:")+"]").getBoundingClientRect().bottom <= document.getElementById("driveList").getBoundingClientRect().bottom',
    ),
  );
  await evaluate('document.getElementById("driveList").scrollTop=0');
  await shot("desktop-light");
  assert.equal(await evaluate('document.documentElement.dataset.pointerReady'), fallback ? "fallback" : "true");
  assert.equal(await evaluate('getComputedStyle(document.getElementById("pointerPaint")).pointerEvents'), "none");
  if(!fallback){
    await sweep(350, 550, "pointer-liquid-light");
    for (let i = 0; i < 30; i++) {
      if ((await evaluate('document.documentElement.dataset.pointerIdle')) === "false") break;
      await wait(100);
    }
    assert.equal(
      await evaluate('document.documentElement.dataset.pointerIdle'),
      "false",
      JSON.stringify(await evaluate('(async()=>{const {pointerInput}=await import("./pointer-paint.js");return {...pointerInput,hidden:document.hidden,focus:document.hasFocus(),reduced:matchMedia("(prefers-reduced-motion: reduce)").matches,ready:document.documentElement.dataset.pointerReady,canvasHidden:document.getElementById("pointerPaint").hidden}})()')),
    );
    win.webContents.sendInputEvent({type:"mouseMove",x:900,y:18});
    let pointerState;
    for (let i = 0; i < 80; i++) {
      pointerState=await evaluate('(async()=>{const {pointerInput}=await import("./pointer-paint.js");return {now:performance.now(),...pointerInput,hidden:document.hidden,focus:document.hasFocus(),idle:document.documentElement.dataset.pointerIdle}})()');
      if (pointerState.idle === "true") break;
      await wait(100);
    }
    assert.equal(pointerState.idle,"true",JSON.stringify(pointerState));
    checks.push("global liquid pointer renders and stops when idle");
  }
  await evaluate(
    'document.querySelector("[data-drive-filter=guarded]").click()',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".drive-card").length'),
    1,
  );
  await evaluate(
    'document.querySelector("[data-drive-filter=removable]").click()',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".drive-card").length'),
    4,
  );
  checks.push("drive filters");
  await evaluate(
    'document.querySelector(".guard-toggle:not(:disabled)").click()',
  );
  await wait(150);
  assert.equal(drives[0].enabled, 0);
  await evaluate(
    'document.querySelector(".guard-toggle:not(:disabled)").click()',
  );
  await wait(150);
  checks.push("guard toggle IPC");
  await evaluate('document.querySelector(".btn-detail").click()');
  await wait(300);
  assert.equal(
    await evaluate('document.querySelectorAll(".proc-row").length'),
    2,
  );
  assert(refreshes > 0);
  await click("drawerClose");
  await wait(300);
  checks.push("process drawer with fresh snapshot");
  await click("btnLogs");
  await wait(350);
  assert.equal(
    await evaluate(
      'document.getElementById("logDialog").classList.contains("hidden")',
    ),
    false,
  );
  await click("errorsOnly");
  assert.equal(
    await evaluate('document.querySelectorAll(".event-item").length'),
    1,
  );
  const live = {
    id: "live",
    timestamp: Date.now(),
    status: "watch_paused",
    ok: 1,
    params: {},
  };
  events.unshift(live);
  listener(live);
  await wait(100);
  assert.equal(
    await evaluate('document.querySelectorAll(".event-item").length'),
    1,
  );
  checks.push("live error filter stays filtered");
  await evaluate(
    'document.getElementById("logSearch").value="missing-search";document.getElementById("logSearch").dispatchEvent(new Event("input"))',
  );
  assert.equal(
    await evaluate('document.querySelectorAll(".event-item").length'),
    0,
  );
  await evaluate(
    'document.getElementById("logSearch").value="";document.getElementById("logSearch").dispatchEvent(new Event("input"))',
  );
  await click("errorsOnly");
  await click("btnExport");
  await wait(200);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(output, "export-smoke.json"), "utf8"))
      .events.length,
    5,
  );
  await shot("event-log");
  await click("logClose");
  checks.push("searchable log modal and JSON export");
  await evaluate('document.querySelector(".menu-trigger").click()');
  assert.equal(
    await evaluate(
      'document.querySelector(".menu-trigger").getAttribute("aria-expanded")',
    ),
    "true",
  );
  await shot("custom-menu");
  await evaluate(
    'document.querySelector(".menu-trigger").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))',
  );
  checks.push("menu keyboard controls");
  await click("btnSettings");
  await wait(400);
  for (let index = 0; index < 3; index++) {
    await evaluate(`document.querySelectorAll(".menu-trigger")[${index}].click()`);
    await wait(100);
    assert.equal(
      await evaluate(`(() => {
        const menu = document.querySelectorAll(".menu-trigger")[${index}].nextElementSibling;
        return [...menu.querySelectorAll("button")].every(button => {
          const rect = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        });
      })()`),
      true,
      "titlebar menu items stay clickable above the settings dialog",
    );
    if (index === 1) await shot("settings-menu-overlay");
    await evaluate(
      'document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))',
    );
    assert.equal(
      await evaluate('document.getElementById("settingsDialog").classList.contains("hidden")'),
      false,
      "Escape closes the menu while keeping settings open",
    );
  }
  checks.push("titlebar menus above settings and menu-first Escape");
  await shot("settings-protection");
  await evaluate(
    'document.querySelector("[data-settings-tab=appearance]").click()',
  );
  await wait(200);
  await shot("settings-appearance");
  if(!fallback) await sweep(700, 500, "pointer-liquid-settings");
  await click("setPointerEffect");
  await wait(150);
  assert.equal(settings.data.pointerEffect, 0);
  assert.equal(await evaluate('document.getElementById("pointerPaint").hidden'),true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(userData,"settings.json"),"utf8")).pointerEffect,0);
  await click("setPointerEffect");
  await wait(150);
  assert.equal(settings.data.pointerEffect,1);
  checks.push("liquid pointer toggle saved and overlay allows control clicks");
  for (const name of ["nebula", "tunnel", "glass", "off", "core"]) {
    await evaluate(
      'document.querySelector("[data-scene-choice=' + name + ']").click()',
    );
    await wait(200);
    assert.equal(settings.data.scene3d, name);
  }
  await evaluate(
    'document.getElementById("qualitySelect").value="low";document.getElementById("qualitySelect").dispatchEvent(new Event("change"))',
  );
  await wait(200);
  assert.equal(settings.data.visualQuality, "low");
  checks.push("scene presets and quality persisted");
  await evaluate(
    'document.querySelector("[data-settings-tab=system]").click()',
  );
  await wait(200);
  await shot("settings-system");
  await evaluate(
    'document.getElementById("setLockInterval").value="999";document.getElementById("setLockInterval").dispatchEvent(new Event("change"))',
  );
  await wait(100);
  assert.equal(settings.data.lockAlertIntervalSec, 600);
  await click("settingsClose");
  await wait(300);
  checks.push("three settings tabs with bounded inputs");
  await click("btnExplore");
  await wait(500);
  console.log("experience state",await evaluate('({view:document.documentElement.dataset.view,settingsOpen,scene:document.documentElement.dataset.scene3d,scroll:document.getElementById("experienceScroll").clientHeight,errors:document.body.className})'));
  for (let chapter = 0; chapter <= 6; chapter++) {
    await evaluate(
      'document.getElementById("experienceScroll").scrollTo({top:' +
        chapter +
        '*document.getElementById("experienceScroll").clientHeight,behavior:"instant"})',
    );
    await wait(450);
    if (!fallback)
      assert.equal(
        await evaluate("document.documentElement.dataset.chapter"),
        String(chapter),
      );
    await shot("chapter-" + chapter);
    if (chapter === 4) {
      await evaluate(
        'document.getElementById("experienceScroll").scrollTo({top:4.3*document.getElementById("experienceScroll").clientHeight,behavior:"instant"})',
      );
      await wait(250);
      await shot("glass-open");
    }
    if (chapter === 1) {
      if (!fallback) {
        await click("btnMotion");
        await wait(500);
      }
      const portraitRect = await evaluate(
        '(()=>{const r=document.getElementById("hero3d").getBoundingClientRect();return{x:Math.round(r.x+r.width*.52),y:Math.round(r.y+60),width:Math.floor(r.width*.45),height:Math.floor(r.height-85)}})()',
      );
      const before = (await win.webContents.capturePage(portraitRect)).toPNG();
      await evaluate('document.querySelectorAll("[data-team]")[2].click()');
      await wait(1400);
      assert.equal(
        await evaluate(
          'document.querySelectorAll("[data-team]")[2].getAttribute("aria-pressed")',
        ),
        "true",
      );
      if (!fallback)
        assert(
          !before.equals(
            (await win.webContents.capturePage(portraitRect)).toPNG(),
          ),
          "paused point-cloud portrait changes with team selection",
        );
      await shot("team-morph");
      if (!fallback) {
        await click("btnMotion");
        await wait(100);
      }
    }
  }
  checks.push(
    "seven scroll chapters including tunnel astronaut glass capabilities and badges",
  );
  await evaluate(
    'document.getElementById("experienceScroll").scrollTo({top:5*document.getElementById("experienceScroll").clientHeight,behavior:"instant"})',
  );
  await wait(200);
  await evaluate(
    'document.querySelector("[data-settings-target=system]").click()',
  );
  await wait(300);
  assert.equal(
    await evaluate(
      'document.querySelector("[data-settings-tab=system]").getAttribute("aria-selected")',
    ),
    "true",
  );
  await click("settingsClose");
  await wait(250);
  checks.push("capability cards open relevant settings");
  await click("btnReturn");
  await wait(300);
  await click("btnMotion");

  await wait(100);
  if (!fallback) {
    for (let i = 0; i < 80; i++) {
      if (
        await evaluate(
          'document.documentElement.dataset.sceneAnimating==="false" && document.documentElement.dataset.pointerIdle==="true"',
        )
      )
        break;
      await wait(50);
    }
    assert.equal(
      await evaluate("document.documentElement.dataset.sceneAnimating"),
      "false",
      "paused renderer settles and stops RAF",
    );
  }
  assert.equal(settings.data.motionPaused, 1);
  if (!fallback) {
    const rect = await evaluate(
      '(()=>{const r=document.getElementById("hero3d").getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:Math.floor(r.width),height:Math.floor(r.height)}})()',
    );
    const hash = async () =>
      require("crypto")
        .createHash("sha256")
        .update((await win.webContents.capturePage(rect)).toPNG())
        .digest("hex");
    const pausedImage = await hash();
    await wait(300);
    assert.equal(await hash(), pausedImage, "paused canvas static");
    const bounds = await evaluate(
      '(()=>{const r=document.getElementById("visualStage").getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()',
    );
    win.webContents.sendInputEvent({
      type: "mouseMove",
      x: Math.round(bounds.x + bounds.width * 0.8),
      y: Math.round(bounds.y + bounds.height * 0.6),
    });
    await wait(400);
    assert.notEqual(await hash(), pausedImage);
    checks.push("GLSL pointer flow and parallax respond while paused");
    await click("btnMotion");
    await wait(200);
    assert.notEqual(await hash(), pausedImage);
    checks.push("animation pause and resume");
    win.webContents.debugger.attach("1.3");
    await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await wait(200);
    assert.equal(
      await evaluate('document.getElementById("btnMotion").disabled'),
      true,
    );
    assert.equal(await evaluate('document.getElementById("pointerPaint").hidden'),true);
    assert.equal(await evaluate('document.documentElement.dataset.pointerIdle'),"true");
    await win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
      features: [],
    });
    win.webContents.debugger.detach();
    checks.push("reduced motion preference");
  }
  await evaluate('document.querySelector("[data-drive-filter=all]").click()');
  await click("btnSettings");
  await wait(300);
  await evaluate(
    'document.querySelector("[data-settings-tab=appearance]").click()',
  );
  await evaluate(
    'document.getElementById("themeSelect").value="dark";document.getElementById("themeSelect").dispatchEvent(new Event("change"))',
  );
  await wait(200);
  assert.equal(
    await evaluate("document.documentElement.dataset.theme"),
    "dark",
  );
  await click("settingsClose");
  await wait(300);
  await evaluate('document.getElementById("toast").classList.add("hidden")');
  await shot("desktop-dark");
  if(!fallback) await sweep(350,550,"pointer-liquid-dark");
  checks.push("dark theme");
  await click("btnSettings");
  await wait(300);
  await evaluate(
    'document.querySelector("[data-settings-tab=appearance]").click()',
  );
  await evaluate(
    'document.getElementById("langSelect").value="en";document.getElementById("langSelect").dispatchEvent(new Event("change"))',
  );
  await wait(250);
  assert.equal(await evaluate("document.documentElement.lang"), "en");
  assert.equal(
    await evaluate(
      '[...document.querySelectorAll("[data-i18n]")].filter(el=>el.textContent===el.dataset.i18n).map(el=>el.dataset.i18n).join(",")',
    ),
    "",
  );
  checks.push("complete English and Chinese strings");
  await click("settingsClose");
  await wait(300);
  win.setSize(820, 640);
  await wait(400);
  const geometry = await evaluate(
    '({width:innerWidth,body:document.body.scrollWidth,controls:Math.round(document.querySelector(".window-controls").getBoundingClientRect().right),list:document.getElementById("driveList").clientHeight})',
  );
  assert(geometry.body <= geometry.width);
  assert.equal(geometry.controls, 820);
  assert(geometry.list > 200);
  await shot("minimum-window");
  await click("btnSettings");
  await wait(300);
  await evaluate(
    'document.querySelector("[data-settings-tab=appearance]").click()',
  );
  await wait(100);
  assert(
    await evaluate(
      'document.querySelector(".settings-content").clientHeight>200',
    ),
  );
  await shot("minimum-settings");
  await click("settingsClose");
  await wait(300);
  checks.push("minimum window has usable independent list");
  await click("winMaximize");
  await wait(250);
  assert(win.isMaximized());
  await click("winMaximize");
  await wait(250);
  assert(!win.isMaximized());
  await click("winMinimize");
  await wait(250);
  assert(win.isMinimized());
  win.restore();
  await wait(200);
  checks.push("custom maximize restore minimize");
  await click("winClose");
  await wait(200);
  assert(!win.isVisible());
  assert(!win.isDestroyed());
  checks.push("close preserves tray guard");
  assert.deepEqual(errors, [], "renderer errors");
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ checks, errors, geometry, visible }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: checks.length, checks, geometry, visible }),
  );
  app.isQuitting = true;
  app.quit();
}
run().catch((error) => {
  console.error(error);
  fs.writeFileSync(
    path.join(output, "failure.txt"),
    error.stack + "\n" + JSON.stringify(errors),
  );
  app.isQuitting = true;
  app.exit(1);
});
