/**
 * PowerShell 调用统一出口
 * ---------------------------------------------------------------
 * 使用 -EncodedCommand（UTF-16LE Base64）传递脚本，避免：
 * 1. cmd/libuv 多层引号转义破坏脚本语法；
 * 2. PowerShell 解析引号时的歧义。
 */
const { execFile } = require('child_process');

const POWERSHELL = 'powershell.exe';

/**
 * 执行一段 PowerShell 脚本
 * @param {string} script PS 脚本内容
 * @param {object} [options] { timeoutMs }
 * @returns {Promise<string>} stdout
 */
function runPs(script, options = {}) {
  // PowerShell 重定向输出默认使用系统 OEM 代码页（中文系统为 GBK），
  // Node 按 UTF-8 解码会乱码，故强制 PS 以 UTF-8 输出
  const full = "try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}\n" + script;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      POWERSHELL,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024,
        timeout: options.timeoutMs || 30000,
      },
      (err, stdout) => {
        if (err) return reject(err);
        resolve(stdout);
      }
    );
  });
}

module.exports = { runPs };
