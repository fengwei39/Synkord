/**
 * electron/cli-installer.cjs
 *
 * 在桌面端首次启动时，把内嵌的 CLI 二进制安装到用户 PATH。
 * - macOS: 复制到 ~/bin/synkord + 追加 PATH 到 .zshrc / .bashrc
 * - Windows: 复制到 %LOCALAPPDATA%\Synkord\bin\synkord.exe + 注册用户 PATH
 *
 * 不做 sudo / 管理员提权，全程用户态。
 */
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const CLI_BINARY_NAME = process.platform === 'win32' ? 'synkord.exe' : 'synkord';
const CLI_DIR_NAME = 'synkord';
const MARKER_BEGIN = '# >>> synkord cli >>>';
const MARKER_END = '# <<< synkord cli <<<';

/**
 * 定位内嵌的 CLI 二进制（在 process.resourcesPath/synkord 或 /synkord.exe）
 */
function locateBundledCLI() {
  const candidates = [
    path.join(process.resourcesPath || '', CLI_BINARY_NAME),
    path.join(process.resourcesPath || '', 'app.asar.unpacked', CLI_BINARY_NAME),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * 安装目标目录
 * - macOS: ~/bin
 * - Windows: %LOCALAPPDATA%\Synkord\bin
 */
function getInstallDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || os.homedir(), 'Synkord', 'bin');
  }
  return path.join(os.homedir(), 'bin');
}

/**
 * 检查 CLI 是否已安装且可用（在 PATH 中）
 */
function isCLIInstalled() {
  const installPath = path.join(getInstallDir(), CLI_BINARY_NAME);
  if (!fs.existsSync(installPath)) return { installed: false, path: null };
  // 简易 PATH 检查
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const dirs = (process.env.PATH || '').split(pathSep);
  return {
    installed: dirs.includes(getInstallDir()),
    path: installPath,
  };
}

/**
 * 同步执行 CLI 看是否能跑（带版本号）
 */
async function runCLI() {
  const installPath = path.join(getInstallDir(), CLI_BINARY_NAME);
  try {
    const { stdout } = await execAsync(`"${installPath}" version`, { timeout: 5000 });
    return { ok: true, output: stdout.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * 安装 CLI：复制二进制 + 写入 PATH
 */
async function installCLI() {
  const bundled = locateBundledCLI();
  if (!bundled) {
    return { ok: false, error: '未找到内嵌的 CLI 二进制（可能当前环境为开发模式）' };
  }

  const installDir = getInstallDir();
  const installPath = path.join(installDir, CLI_BINARY_NAME);

  // 1. 创建目录 + 复制二进制
  await fsp.mkdir(installDir, { recursive: true });
  await fsp.copyFile(bundled, installPath);
  if (process.platform !== 'win32') {
    await fsp.chmod(installPath, 0o755);
  }

  // 2. 写入 PATH
  const pathResult = await ensureBinInPath(installDir);
  if (!pathResult.ok) {
    return { ok: true, warning: `已安装到 ${installPath}，但 PATH 更新失败：${pathResult.error}`, path: installPath };
  }

  return { ok: true, path: installPath, shellHint: pathResult.shellHint };
}

/**
 * 卸载 CLI
 */
async function uninstallCLI() {
  const installPath = path.join(getInstallDir(), CLI_BINARY_NAME);
  let removed = false;
  if (fs.existsSync(installPath)) {
    await fsp.unlink(installPath);
    removed = true;
  }
  // 从 PATH 移除
  await removeBinFromPath(getInstallDir());
  return { ok: true, removed };
}

/**
 * 把 installDir 加入用户 PATH
 * - macOS: 改 .zshrc / .bashrc（写一段被 marker 包裹的 export）
 * - Windows: 注册表 HKCU\Environment Path（无需管理员）
 */
async function ensureBinInPath(installDir) {
  if (process.platform === 'win32') {
    return await ensureWinPath(installDir);
  }
  return await ensureUnixPath(installDir);
}

async function ensureUnixPath(installDir) {
  // 检测当前 shell
  const shell = process.env.SHELL || '/bin/zsh';
  const rcFile = shell.endsWith('zsh')
    ? path.join(os.homedir(), '.zshrc')
    : shell.endsWith('fish')
      ? path.join(os.homedir(), '.config', 'fish', 'config.fish')
      : path.join(os.homedir(), '.bashrc');

  // 已包含则跳过
  try {
    const content = await fsp.readFile(rcFile, 'utf8');
    if (content.includes(MARKER_BEGIN) && content.includes(installDir)) {
      return { ok: true, shellHint: rcFile };
    }
  } catch (_) { /* 文件不存在，等下创建 */ }

  const line = `${MARKER_BEGIN}\nexport PATH="$PATH:${installDir}"\n${MARKER_END}\n`;
  try {
    await fsp.appendFile(rcFile, `\n${line}`, 'utf8');
    return {
      ok: true,
      shellHint: `${rcFile}（新开终端生效）`,
    };
  } catch (err) {
    return { ok: false, error: err.message, shellHint: rcFile };
  }
}

async function ensureWinPath(installDir) {
  // 用 setx 写用户级 PATH（无需管理员）
  // 读现有 → 追加 → 写回
  try {
    const { stdout } = await execAsync('reg query "HKCU\\Environment" /v Path', { windowsHide: true });
    const m = stdout.match(/Path\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\r?\n/);
    const current = m ? m[1].trim() : '';
    if (current.split(';').map(s => s.trim()).includes(installDir)) {
      return { ok: true, shellHint: '已在新开终端生效' };
    }
    const newPath = current ? `${current};${installDir}` : installDir;
    // setx 限制 1024 字符，超过会失败
    if (newPath.length > 1024) {
      return { ok: false, error: 'PATH 已超过 1024 字符限制，请手动添加 ' + installDir };
    }
    await execAsync(`setx Path "${newPath}"`, { windowsHide: true });
    // 当前进程也要更新，否则要重启
    process.env.Path = newPath;
    return { ok: true, shellHint: '已注册到用户 PATH（新开 cmd / PowerShell 生效）' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function removeBinFromPath(installDir) {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync('reg query "HKCU\\Environment" /v Path', { windowsHide: true });
      const m = stdout.match(/Path\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\r?\n/);
      if (!m) return;
      const parts = m[1].split(';').map(s => s.trim()).filter(s => s && s !== installDir);
      await execAsync(`setx Path "${parts.join(';')}"`, { windowsHide: true });
    } catch (_) { /* ignore */ }
    return;
  }
  const shell = process.env.SHELL || '/bin/zsh';
  const rcFile = shell.endsWith('zsh')
    ? path.join(os.homedir(), '.zshrc')
    : shell.endsWith('fish')
      ? path.join(os.homedir(), '.config', 'fish', 'config.fish')
      : path.join(os.homedir(), '.bashrc');
  try {
    const content = await fsp.readFile(rcFile, 'utf8');
    const re = new RegExp(`\\n?${escapeRegex(MARKER_BEGIN)}[\\s\\S]*?${escapeRegex(MARKER_END)}\\n?`, 'g');
    const newContent = content.replace(re, '');
    if (newContent !== content) {
      await fsp.writeFile(rcFile, newContent, 'utf8');
    }
  } catch (_) { /* ignore */ }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  locateBundledCLI,
  isCLIInstalled,
  runCLI,
  installCLI,
  uninstallCLI,
  getInstallDir,
};
