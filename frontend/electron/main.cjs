/**
 * electron/main.cjs
 *
 * Electron 主进程入口
 * 对应设计文档：
 *  - §3 启动方式：UI 手动控制启停
 *  - §9.3 生命周期：状态机、5s 超时、异常自动重启（最多 3 次）
 *  - §11.1 配置优先级：内存（IPC 推送）最高
 *  - §10 安全：仅 127.0.0.1 监听
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const { fork, spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const os = require('os');

// ============================================================================
// 配置常量
// ============================================================================

const DEFAULT_HTTP_PORT = 37991;
const HOST = '127.0.0.1'; // 文档 §10：仅本机回环
const READY_TIMEOUT_MS = 5000; // 文档 §9.3：5s 启动超时
const SHUTDOWN_TIMEOUT_MS = 5000; // 文档 §9.3：5s 关停超时
const MAX_AUTO_RESTART = 3; // 文档 §9.3：最多 3 次自动重启
const SYNKORD_HOME = process.env.SYNKORD_HOME || path.join(os.homedir(), '.synkord');

/**
 * 获取 MCP 服务脚本（local-mcp-service.cjs）的绝对路径。
 * - 开发态：位于 __dirname（即 frontend/electron/）
 * - 打包态：asar 内路径（Electron 会在 fork 时从 asar 抽取）
 * 同一路径既用于 fork HTTP 子进程，也用于 STDIO 接入配置展示。
 */
function getMcpServicePath() {
  return path.join(__dirname, 'local-mcp-service.cjs');
}

const ACTIVE_CONTEXT_FILE = path.join(SYNKORD_HOME, 'active-context.json');
const USER_AUTH_FILE = path.join(SYNKORD_HOME, 'user-auth.json');

// ============================================================================
// 进程状态（文档 §9.3 状态机）
// ============================================================================

/**
 * 状态机：
 *   idle ──fork──> starting ──ready──> running ──kill──> stopped
 *     ↑                  │                  │
 *     │                  └──timeout──> failed
 *     │                                     │
 *     └──────────────── restart <────────exit（异常）
 */
let mcpState = 'idle';
let mcpProcess = null;
let mcpRestartCount = 0;
let activeProject = null;
let mainWindow = null;
let mcpActualPort = null; // 实际启动的端口（可能因冲突自动避让）

const mcpStatus = () => ({
  state: mcpState,
  // port / url / pid 仅在真正就绪（state==='running'）时对外暴露，
  // 避免 starting 阶段 UI 展示可访问链接导致 ECONNREFUSED
  port: mcpState === 'running' ? mcpActualPort : null,
  url: mcpState === 'running' ? `http://${HOST}:${mcpActualPort}/mcp` : null,
  pid: mcpState === 'running' ? mcpProcess?.pid || null : null,
  activeProject: activeProject || null,
  restartCount: mcpRestartCount,
  reason: mcpState === 'failed' ? (lastFailureReason || '启动失败') : undefined,
});

let lastFailureReason = '';

// ============================================================================
// 文件读写（文档 §14.2 原子写入）
// ============================================================================

function ensureSynkordHome() {
  try {
    if (!fs.existsSync(SYNKORD_HOME)) {
      fs.mkdirSync(SYNKORD_HOME, { recursive: true, mode: 0o700 });
    }
  } catch (e) {
    console.error('[synkord] failed to ensure SYNKORD_HOME', e);
  }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  try {
    ensureSynkordHome();
    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch (e) {
    console.error('[synkord] failed to write', filePath, e);
  }
}

function writeActiveContext() {
  writeJsonAtomic(ACTIVE_CONTEXT_FILE, {
    team_id: activeProject?.teamId || null,
    project_id: activeProject?.projectId || null,
    project_name: activeProject?.projectName || null,
    synkord_core_url: process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000/api',
    updated_at: new Date().toISOString(),
  });
}

function readActiveContext() {
  return readJsonSafe(ACTIVE_CONTEXT_FILE);
}

// ============================================================================
// 端口预检（文档 §1.4 端口冲突处理）
// ============================================================================

function tryBindPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, HOST);
  });
}

async function findAvailablePort(preferred = DEFAULT_HTTP_PORT) {
  for (let p = preferred; p < preferred + 10; p++) {
    if (await tryBindPort(p)) return p;
  }
  throw new Error('no available port');
}

// ============================================================================
// 状态推送（文档 §1.3 IPC: mcp:event）
// ============================================================================

function notifyUI(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mcp:event', {
      type: event,
      state: mcpState,
      ...mcpStatus(),
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// MCP Server 生命周期（文档 §9.3）
// ============================================================================

async function startMCPServer() {
  if (mcpState === 'starting' || mcpState === 'running') {
    console.log('[synkord] startMCPServer ignored, state=' + mcpState);
    return mcpStatus();
  }

  console.log('[synkord] startMCPServer: step 1/6 - state=starting');
  mcpState = 'starting';
  // 进入新一轮启动：清空上一轮失败原因，避免 mcpStatus() 在新一轮失败前读到陈旧文案
  lastFailureReason = '';
  notifyUI('starting');

  // 1. 写一次激活上下文
  console.log('[synkord] step 2/6 - write active context');
  writeActiveContext();

  // 2. 预检端口
  let port;
  try {
    port = await findAvailablePort();
    console.log('[synkord] step 3/6 - port allocated: ' + port);
  } catch (e) {
    console.error('[synkord] step 3/6 FAILED: no available port -', e.message);
    mcpState = 'failed';
    lastFailureReason = '无可用端口：' + e.message;
    notifyUI('failed');
    return mcpStatus();
  }
  mcpActualPort = port;

  // 3. fork 子进程
  const servicePath = getMcpServicePath();
  if (!fs.existsSync(servicePath)) {
    console.error('[synkord] step 4/6 FAILED: service script not found: ' + servicePath);
    mcpState = 'failed';
    lastFailureReason = `服务脚本不存在: ${servicePath}`;
    notifyUI('failed');
    return mcpStatus();
  }

  console.log('[synkord] step 4/6 - forking: ' + servicePath);
  mcpProcess = fork(servicePath, ['--mode', 'http', '--port', String(port)], {
    env: {
      ...process.env,
      SYNKORD_HOME,
    },
    // 注意：stdin 必须用 'pipe'，不能用 'ignore'，否则 Electron 下 IPC 通道会断
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });
  console.log('[synkord] step 4/6 - forked, pid=' + mcpProcess.pid + ' hasSend=' + (typeof mcpProcess.send));

  // 静默 stdin
  mcpProcess.stdin?.on('data', () => {});
  mcpProcess.stdin?.on('error', () => {});

  // 4. 转发日志
  mcpProcess.stdout?.on('data', (chunk) => {
    process.stdout.write(`[mcp-server] ${chunk}`);
  });
  mcpProcess.stderr?.on('data', (chunk) => {
    process.stderr.write(`[mcp-server-err] ${chunk}`);
  });

  // 5. 启动超时
  const timer = setTimeout(() => {
    if (mcpState === 'starting') {
      console.error('[synkord] step 6/6 TIMEOUT: 5s 内未收到 ready 信号');
      mcpProcess?.kill('SIGKILL');
      mcpProcess = null;
      mcpState = 'failed';
      lastFailureReason = '启动超时（5s 内未收到 ready 信号）';
      // 方案 A：未 ready 前的超时直接耗尽重试配额，阻断后续 exit 自动重启
      mcpRestartCount = MAX_AUTO_RESTART;
      notifyUI('failed');
    }
  }, READY_TIMEOUT_MS);

  // 6. 等待 ready 信号
  mcpProcess.once('error', (error) => {
    clearTimeout(timer);
    console.error('[synkord] step 6/6 ERROR:', error);
    mcpProcess = null;
    mcpState = 'failed';
    // 拼上 error.code 与首行堆栈，便于线上定位根因
    const codePart = error?.code ? `[${error.code}] ` : '';
    const stackHead = (error?.stack || '').split('\n')[0] || '';
    lastFailureReason = '进程错误：' + codePart + error.message + (stackHead ? ` (${stackHead})` : '');
    notifyUI('failed');
  });

  mcpProcess.on('message', (message) => {
    console.log('[synkord] step 5/6 - got message:', JSON.stringify(message));
    if (message?.type === 'ready') {
      clearTimeout(timer);
      mcpState = 'running';
      mcpRestartCount = 0;
      console.log('[synkord] step 6/6 - running! port=' + message.port);
      notifyUI('running');
    }
  });

  // 7. 监听异常退出
  mcpProcess.on('exit', (code, signal) => {
    console.log('[synkord] mcp-server exited: code=' + code + ' signal=' + signal);
    if (mcpState === 'stopped') return;
    handleUnexpectedExit(code, signal);
  });

  return mcpStatus();
}

function handleUnexpectedExit(code, signal) {
  console.error(`[synkord] MCP server unexpected exit: code=${code} signal=${signal}`);
  mcpProcess = null;

  if (mcpRestartCount >= MAX_AUTO_RESTART) {
    mcpState = 'failed';
    lastFailureReason = `超过最大重启次数 (${MAX_AUTO_RESTART})`;
    notifyUI('failed');
    return;
  }

  mcpRestartCount++;
  mcpState = 'restarting';
  notifyUI('restarting');

  // 退避策略：1s, 2s, 3s
  const delay = 1000 * mcpRestartCount;
  setTimeout(() => {
    startMCPServer();
  }, delay);
}

function stopMCPServer() {
  return new Promise((resolve) => {
    if (!mcpProcess) {
      mcpState = 'idle';
      resolve(mcpStatus());
      return;
    }
    mcpState = 'stopped';
    notifyUI('stopped');

    const proc = mcpProcess;
    const timer = setTimeout(() => {
      // 5s 超时后强杀
      console.warn('[synkord] MCP server shutdown timeout, sending SIGKILL');
      proc.kill('SIGKILL');
    }, SHUTDOWN_TIMEOUT_MS);

    proc.once('exit', () => {
      clearTimeout(timer);
      mcpProcess = null;
      mcpState = 'idle';
      resolve(mcpStatus());
    });

    // 先发优雅关闭信号
    try {
      proc.send?.({ type: 'shutdown' });
    } catch {
      // ignore
    }
    // 兜底：如果没响应，1s 后发 SIGTERM
    setTimeout(() => {
      if (!proc.killed) {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      }
    }, 1000);
  });
}

async function restartMCPServer() {
  await stopMCPServer();
  mcpRestartCount = 0; // 手动重启重置计数
  return await startMCPServer();
}

// ============================================================================
// 激活项目（文档 §11.1 内存最高优先级）
// ============================================================================

function setActiveProject(project) {
  if (project && project.teamId && project.projectId) {
    activeProject = {
      teamId: String(project.teamId),
      projectId: String(project.projectId),
      projectName: String(project.projectName || ''),
    };
  } else {
    activeProject = null;
  }
  writeActiveContext();
  // 通知运行中的 MCP Server（IPC 推送，文档 §11.1 内存优先）
  if (mcpProcess?.connected) {
    mcpProcess.send({
      type: 'set-active-project',
      project: activeProject,
    });
  }
  return mcpStatus();
}

// ============================================================================
// IPC 注册（文档 §1.3）
// ============================================================================

function getAPIBase() {
  return process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000/api';
}

function getRecentAccessLog(limit = 50) {
  try {
    const logPath = path.join(SYNKORD_HOME, 'mcp-access.log');
    if (!fs.existsSync(logPath)) return { items: [], total: 0 };
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    // total 用原始行数（不解析 JSON，便宜且准确）
    const total = lines.length;
    // items 仅对切片部分做 JSON 解析
    const items = lines.slice(-limit).reverse().map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    return { items, total };
  } catch {
    return { items: [], total: 0 };
  }
}

function registerIpc() {
  ipcMain.handle('mcp:get-api-base', () => getAPIBase());
  ipcMain.handle('mcp:get-status', () => mcpStatus());
  ipcMain.handle('mcp:start', () => startMCPServer());
  ipcMain.handle('mcp:stop', () => stopMCPServer());
  ipcMain.handle('mcp:restart', () => restartMCPServer());
  ipcMain.handle('mcp:set-active-project', (_e, project) => setActiveProject(project));
  ipcMain.handle('mcp:get-ide-config', () => ({
    url: `http://${HOST}:${DEFAULT_HTTP_PORT}/mcp`,
    host: HOST,
    port: DEFAULT_HTTP_PORT,
    path: '/mcp',
  }));
  ipcMain.handle('mcp:get-access-log', (_e, limit) => getRecentAccessLog(limit || 50));
}

// ============================================================================
// 浏览器窗口
// ============================================================================

const isDev = !app.isPackaged;
const devURL = process.env.SYNKORD_DEV_URL || 'http://127.0.0.1:3000';
let viteProcess = null;

// 等待 HTTP 端口可用（最多 timeoutMs 毫秒）
function waitForPort(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function check() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`timeout waiting for ${url}`));
          return;
        }
        setTimeout(check, 500);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`timeout waiting for ${url}`));
          return;
        }
        setTimeout(check, 500);
      });
    }
    check();
  });
}

// 启动 Vite 开发服务（dev 模式自动启动）
async function ensureViteRunning() {
  if (!isDev) return; // 生产模式不需要
  if (process.env.SYNKORD_DEV_URL) return; // 外部指定 URL，跳过

  // 先用 HTTP 请求探测端口是否在响应
  const alreadyRunning = await isViteResponding();
  if (alreadyRunning) {
    console.log('[synkord] Vite already running on', devURL);
    return;
  }

  // 启动 Vite
  startVite();
  // 等待 Vite 端口就绪（最多 30s）
  await waitForPort(devURL, 30000);
  console.log('[synkord] Vite is ready on', devURL);
}

// 用 HTTP 请求探测 Vite 是否在响应（不是只探测端口）
function isViteResponding() {
  return new Promise((resolve) => {
    const req = http.get(devURL, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startVite() {
  console.log('[synkord] starting Vite dev server...');
  const isWin = process.platform === 'win32';
  if (isWin) {
    // Windows：直接调 vite.js 入口脚本，避开 .cmd shim
    const viteScript = path.join(__dirname, '..', 'node_modules', 'vite', 'bin', 'vite.js');
    viteProcess = spawn(process.execPath, [viteScript], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, BROWSER: 'none' },
    });
  } else {
    const viteBin = path.join(__dirname, '..', 'node_modules', '.bin', 'vite');
    viteProcess = spawn(viteBin, [], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: { ...process.env, BROWSER: 'none' },
    });
  }
  viteProcess.on('exit', (code) => {
    console.log(`[synkord] Vite exited with code ${code}`);
    viteProcess = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Synkord',
    frame: false,
    backgroundColor: '#f5f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(devURL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// ============================================================================
// 应用生命周期
// ============================================================================

app.whenReady().then(async () => {
  ensureSynkordHome();
  // 启动时读一次激活项目
  const ctx = readActiveContext();
  if (ctx && ctx.team_id && ctx.project_id) {
    activeProject = {
      teamId: ctx.team_id,
      projectId: ctx.project_id,
      projectName: ctx.project_name || '',
    };
  }
  registerIpc();

  // Dev 模式：自动启动 Vite（如未运行）
  if (isDev && !process.env.SYNKORD_DEV_URL) {
    try {
      await ensureViteRunning();
      // 等待端口可用
      await waitForPort(devURL, 30000);
      console.log('[synkord] Vite is ready');
    } catch (e) {
      console.error('[synkord] Vite startup failed:', e.message);
    }
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // 同步停止 MCP Server
  if (mcpProcess && !mcpProcess.killed) {
    try { mcpProcess.kill('SIGTERM'); } catch { /* ignore */ }
  }
  // 停止 Vite（如启动过）
  if (viteProcess && !viteProcess.killed) {
    try { viteProcess.kill('SIGTERM'); } catch { /* ignore */ }
  }
});
