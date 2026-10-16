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
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
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
