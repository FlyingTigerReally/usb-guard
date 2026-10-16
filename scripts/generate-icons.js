/**
 * 图标生成工具（零依赖）
 * ---------------------------------------------------------------
 * 作用：把 SVG 原稿渲染成各尺寸 PNG，并打包标准 Windows .ico
 * 原理：Electron 隐藏窗口 + canvas 把 SVG 绘制成 PNG，再按 ICONDIR 规范打包
 *
 * 用法：electron scripts/generate-icons.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname, '..', 'assets', 'icons');
const SOURCES = {
  app: path.join(ICON_DIR, 'app-icon.svg'),   // 应用图标（.ico 源）
  tray: path.join(ICON_DIR, 'tray-icon.svg'), // 托盘图标
  logo: path.join(ICON_DIR, 'logo.svg'),      // 项目 Logo（README 用）
};
// .ico 内含尺寸（Windows 常用：16/24/32/48/64/128/256）
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
// 独立 PNG 尺寸（托盘与 logo 用）
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

/**
 * 打包标准 Windows .ico
 * ICONDIR(6) + ICONDIRENTRY*(16) + PNG 数据
 */
function packIco(entries) {
  const count = entries.length;
  const headerSize = 6 + 16 * count;
  let total = headerSize;
  for (const e of entries) total += e.data.length;
  const buf = Buffer.alloc(total);
  buf.writeUInt16LE(0, 0);       // reserved
  buf.writeUInt16LE(1, 2);       // type: 1 = icon
  buf.writeUInt16LE(count, 4);   // count
  let offset = headerSize;
  entries.forEach((e, i) => {
    const o = 6 + 16 * i;
    buf.writeUInt8(e.size >= 256 ? 0 : e.size, o + 0);  // width (0 means 256)
    buf.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);  // height
    buf.writeUInt8(0, o + 2);      // color count
    buf.writeUInt8(0, o + 3);      // reserved
    buf.writeUInt16LE(1, o + 4);   // planes
    buf.writeUInt16LE(32, o + 6);  // bit count
    buf.writeUInt32LE(e.data.length, o + 8);  // bytes in resource
    buf.writeUInt32LE(offset, o + 12);        // image offset
    e.data.copy(buf, offset);
    offset += e.data.length;
  });
  return buf;
}

// 渲染 SVG -> 指定尺寸 PNG（在隐藏窗口的 canvas 里完成）
function renderSvgToPng(win, svg, size) {
  return win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const svg = ${JSON.stringify(svg)};
      const img = new Image();
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = ${size};
          canvas.height = ${size};
          const ctx = canvas.getContext('2d');
          // 透明背景，SVG 自身绘制全部内容
          ctx.drawImage(img, 0, 0, ${size}, ${size});
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) { reject(String(err)); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject('svg load failed'); };
      img.src = url;
    })
  `).then((dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64'));
}

async function main() {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: false },
  });
  await win.loadURL('about:blank');

  const read = (f) => fs.readFileSync(f, 'utf8');

  // 1) 应用图标：各尺寸 PNG + 打包 .ico
  const appSvg = read(SOURCES.app);
  const icoEntries = [];
  for (const size of ICO_SIZES) {
    const data = await renderSvgToPng(win, appSvg, size);
    fs.writeFileSync(path.join(ICON_DIR, `app-${size}.png`), data);
    icoEntries.push({ size, data });
  }
  fs.writeFileSync(path.join(ICON_DIR, 'icon.ico'), packIco(icoEntries));
  console.log('OK icon.ico  (' + ICO_SIZES.join('/') + ')');

  // 2) 托盘图标：各尺寸 PNG（托盘用小尺寸最清晰）
  const traySvg = read(SOURCES.tray);
  for (const size of PNG_SIZES) {
    const data = await renderSvgToPng(win, traySvg, size);
    fs.writeFileSync(path.join(ICON_DIR, `tray-${size}.png`), data);
  }
  console.log('OK tray-*.png (' + PNG_SIZES.join('/') + ')');

  // 3) 项目 Logo：各尺寸 PNG（README/GitHub 展示）
  const logoSvg = read(SOURCES.logo);
  for (const size of PNG_SIZES) {
    const data = await renderSvgToPng(win, logoSvg, size);
    fs.writeFileSync(path.join(ICON_DIR, `logo-${size}.png`), data);
  }
  console.log('OK logo-*.png (' + PNG_SIZES.join('/') + ')');

  win.destroy();
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error(e);
  app.exit(1);
});
