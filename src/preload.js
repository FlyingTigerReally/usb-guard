/**
 * preload：向渲染进程暴露受控 API
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('usbGuard', {
  // 拉取初始状态（驱动器列表 + 事件日志 + 设置）
  getState: () => ipcRenderer.invoke('guard:getState'),
  // 开关某盘守护，enabled: 1/0
  setGuard: (driveId, enabled) => ipcRenderer.invoke('guard:setGuard', driveId, enabled),
  // 立即关闭某盘的全部相关进程
  killAll: (driveId) => ipcRenderer.invoke('guard:killAll', driveId),
  // 刷新进程快照
  refresh: () => ipcRenderer.invoke('guard:refresh'),
  // 更新设置项
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  // 切换界面语言（'en' / 'zh-CN'）
  setLocale: (code) => ipcRenderer.invoke('app:setLocale', code),
  // 取指定语言的语言包
  getI18n: (code) => ipcRenderer.invoke('app:getI18n', code),
  // 订阅实时事件
  onEvent: (fn) => ipcRenderer.on('guard:event', (_e, evt) => fn(evt)),
});
