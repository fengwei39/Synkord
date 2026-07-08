/**
 * electron/main.cjs
 *
 * Synkord Electron 主进程（v1.2 重构版）
 * 对应设计文档：
 *  - docs/architecture.md §四（Auth Manager + Auth Gateway + Connect）
 *  - §3 自动 refresh / 401 通知
 *  - §5 IPC 白名单：仅暴露必要通道
 *  - §10 仅监听 127.0.0.1
 *
 * 主要职责：
 *  1. 创建 BrowserWindow 加载前端
 *  2. 启动 AuthGateway（本地 HTTP 代理，注入 JWT）
 *  3. 启动 AuthManager（凭证管理 + 自动 refresh）
 *  4. 启动 Connect（MCP 子进程）
 *  5. 注册 IPC handlers（白名单）
 */
'use strict';

// ============================================================================
// v1.2 修订：require('electron') 在 pnpm 安装模式下可能返回字符串路径
// （electron 包 index.js 正常是导出 binary 路径；Electron 主进程的 C++
//  binding 会把它替换为 native module）。在 pnpm nested layout 下 binding
// 偶尔 lookup 失败，导致 app/BrowserWindow 等为 undefined。
// 这里做一次 sanity check 并给出明确提示，避免白屏。
// ============================================================================
const electron = require('electron')
const { app, BrowserWindow, ipcMain, shell, dialog } = electron
// CLI 安装器（仅打包后使用）
const cliInstaller = require('./cli-installer.cjs')
// electron-updater 仅在打包后的生产环境加载；开发模式 dev 模式下不要触发更新
let autoUpdater = null
let updateState = {
  checking: false,
  downloading: false,
  downloaded: false,
  availableInfo: null,
  error: null,
}
if (app.isPackaged) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater: au } = require('electron-updater')
    autoUpdater = au
    autoUpdater.logger = require('electron-log').default
    autoUpdater.autoDownload = false  // 显式确认，不静默下载
    autoUpdater.autoInstallOnAppQuit = true
  } catch (err) {
    console.warn('[main] electron-updater not available:', err.message)
  }
}
if (typeof electron !== 'object' || !app || typeof app.whenReady !== 'function') {
  console.error('')
  console.error('[synkord] FATAL: require("electron") did not return the native module.')
  console.error('              got:', typeof electron, electron)
  console.error('')
  console.error('  This is a known pnpm + electron nesting issue.')
  console.error('  Fix:')
  console.error('    1. cd frontend')
  console.error('    2. rm -rf node_modules pnpm-lock.yaml')
  console.error('    3. pnpm install            (frontend/.npmrc has shamefully-hoist=true)')
  console.error('    4. verify node_modules/electron/dist/electron.exe exists directly')
  console.error('')
  process.exit(2)
}

const path = require('path');
const os = require('os');
const fs = require('fs');
const { fork, spawn } = require('child_process');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const { AuthManager, ActiveContractStore, SYNKORD_HOME } = require('./auth-manager.cjs');
const { AuthGateway } = require('./auth-gateway.cjs');

// ============================================================================
// 配置
// ============================================================================

const HOST = '127.0.0.1';  // 仅本机
const DEFAULT_BACKEND_URL = process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000';
const DEFAULT_MCP_PORT = 37991;
const SYNCORD_HOME = process.env.SYNKORD_HOME || path.join(os.homedir(), '.synkord');
const SERVER_CONFIG_FILE = path.join(SYNCORD_HOME, 'server-config.json');

process.env.SYNKORD_HOME = SYNCORD_HOME;
fs.mkdirSync(SYNCORD_HOME, { recursive: true, mode: 0o700 });

function ensureApiSuffix(url) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

function assertValidApiBase(apiBase) {
  const normalized = ensureApiSuffix(apiBase)
  return normalized
}

function apiBaseToBackendUrl(apiBase) {
  return ensureApiSuffix(apiBase).replace(/\/api$/, '')
}

function loadConfiguredApiBase() {
  try {
    if (!fs.existsSync(SERVER_CONFIG_FILE)) return null
    const data = JSON.parse(fs.readFileSync(SERVER_CONFIG_FILE, 'utf-8'))
    return data.apiBase ? ensureApiSuffix(data.apiBase) : null
  } catch (err) {
    console.warn('[main] load server config failed:', err.message)
    return null
  }
}

function saveConfiguredApiBase(apiBase) {
  const normalized = assertValidApiBase(apiBase)
  fs.mkdirSync(SYNCORD_HOME, { recursive: true, mode: 0o700 })
  fs.writeFileSync(
    SERVER_CONFIG_FILE,
    JSON.stringify({ apiBase: normalized, updated_at: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  )
  return normalized
}

let configuredApiBase = loadConfiguredApiBase()
let currentBackendUrl = configuredApiBase
  ? apiBaseToBackendUrl(configuredApiBase)
  : DEFAULT_BACKEND_URL.replace(/\/+$/, '')

function currentApiBase() {
  return configuredApiBase || ensureApiSuffix(currentBackendUrl)
}

function parseHttpApiBase(apiBase) {
  const normalized = ensureApiSuffix(apiBase)
  const match = normalized.match(/^(https?):\/\/(\[[^\]]+\]|[^/:]+)(?::(\d+))?(\/.*)?$/i)
  if (!match) {
    throw new Error(`server address cannot be used for HTTP request: ${apiBase}`)
  }
  const protocol = match[1].toLowerCase() + ':'
  const hostname = match[2].replace(/^\[(.*)\]$/, '$1')
  const port = match[3] || (protocol === 'https:' ? '443' : '80')
  const basePath = (match[4] || '').replace(/\/+$/, '')
  return { protocol, hostname, port, basePath, normalized }
}

function joinPath(basePath, pathPart) {
  const left = String(basePath || '').replace(/\/+$/, '')
  const right = String(pathPart || '').replace(/^\/+/, '')
  return `${left}/${right}`
}

function backendJsonRequest({ apiBase, path: requestPath, method = 'GET', body, token }) {
  const requestApiBase = apiBase && !String(apiBase).trim().startsWith('/')
    ? apiBase
    : currentApiBase()
  const parsed = parseHttpApiBase(requestApiBase)
  const bodyText = body === undefined ? null : JSON.stringify(body)
  const headers = {
    Accept: 'application/json',
  }
  if (bodyText !== null) {
    headers['Content-Type'] = 'application/json'
    headers['Content-Length'] = Buffer.byteLength(bodyText)
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const options = {
    hostname: parsed.hostname,
    port: parsed.port,
    path: joinPath(parsed.basePath, requestPath),
    method,
    headers,
  }

  console.log(`[main] backend request → ${method} ${parsed.protocol}//${parsed.hostname}:${parsed.port}${options.path}`)

  return new Promise((resolve, reject) => {
    const transport = parsed.protocol === 'https:' ? https : http
    const req = transport.request(options, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let data = null
        try {
          data = text ? JSON.parse(text) : null
        } catch {
          data = text
        }
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          const detail = typeof data === 'object' && data ? (data.detail || data.message) : text
          const err = new Error(detail || `HTTP ${res.statusCode}`)
          err.status = res.statusCode
          err.data = data
          reject(err)
          return
        }
        resolve(data)
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy(new Error('request timeout'))
    })
    if (bodyText !== null) {
      req.write(bodyText)
    }
    req.end()
  })
}

// 实例 ID（用于审计）
const INSTANCE_ID = crypto.randomUUID();

// ============================================================================
// 单例：auth manager / gateway / active contract store
// ============================================================================

const authManager = new AuthManager({ backendUrl: currentBackendUrl, onUnauthorized });
let authGateway = null;
let activeContractStore = new ActiveContractStore();

let mainWindow = null;

// ============================================================================
// MCP 进程管理
// ============================================================================

/**
 * MCP 进程状态
 * 状态机：stopped → starting → running → (failed|stopped)
 */
const mcpState = {
  process: null,
  state: 'stopped',          // 'stopped' | 'starting' | 'running' | 'failed' | 'restarting'
  pid: null,
  port: null,                // 实际占用的端口
  url: null,
  started_at: null,
  last_error: null,
  last_connection: null,     // { client, at }
  restart_count: 0,
  max_restart: 3,
  gateway_port: null,        // AuthGateway 端口
}

function getConnectPath() {
  return path.join(__dirname, 'local-mcp-service.cjs')
}

function broadcastMcpStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const status = {
    state: mcpState.state,
    pid: mcpState.pid,
    port: mcpState.port,
    url: mcpState.url,
    started_at: mcpState.started_at,
    last_connection: mcpState.last_connection,
    last_error: mcpState.last_error,
    restart_count: mcpState.restart_count,
    gateway_port: mcpState.gateway_port,
    instance_id: INSTANCE_ID,
  }
  mainWindow.webContents.send('mcp:event', status)
}

async function startMCPServer() {
  if (mcpState.state === 'running' || mcpState.state === 'starting') {
    return mcpStatus()
  }

  mcpState.state = 'starting'
  mcpState.last_error = null
  broadcastMcpStatus()

  // 1. 启动 Auth Gateway
  if (!authGateway) {
    authGateway = new AuthGateway({
      authManager,
      backendUrl: currentBackendUrl,
      instanceId: INSTANCE_ID,
    })
    try {
      await authGateway.start()
      mcpState.gateway_port = authGateway.port
      console.log(`[main] auth-gateway started on 127.0.0.1:${authGateway.port}`)
    } catch (err) {
      mcpState.state = 'failed'
      mcpState.last_error = `auth-gateway start failed: ${err.message}`
      broadcastMcpStatus()
      throw err
    }
  }

  // 2. 启动 Connect 子进程
  return new Promise((resolve, reject) => {
    const connectPath = getConnectPath()
    const env = {
      ...process.env,
      SYNKORD_HOME,
      SYNKORD_API_BASE: currentApiBase(),
      SYNKORD_GATEWAY_URL: `http://${HOST}:${authGateway.port}`,
      SYNKORD_INSTANCE_ID: INSTANCE_ID,
    }

    let child
    try {
      child = fork(connectPath, ['http', '--port', String(DEFAULT_MCP_PORT)], {
        env,
        silent: false,
      })
    } catch (err) {
      mcpState.state = 'failed'
      mcpState.last_error = `connect fork failed: ${err.message}`
      broadcastMcpStatus()
      reject(err)
      return
    }

    mcpState.process = child
    mcpState.pid = child.pid
    let resolved = false

    // 等待 connect 启动（最多 10s）
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        mcpState.state = 'failed'
        mcpState.last_error = 'connect start timeout (10s)'
        broadcastMcpStatus()
        reject(new Error('connect start timeout'))
      }
    }, 10000)

    child.on('message', (msg) => {
      if (msg?.type === 'ready') {
        resolved = true
        clearTimeout(timeout)
        mcpState.state = 'running'
        mcpState.port = msg.port || DEFAULT_MCP_PORT
        mcpState.url = `http://${HOST}:${mcpState.port}/mcp`
        mcpState.started_at = new Date().toISOString()
        broadcastMcpStatus()
        resolve(mcpStatus())
      } else if (msg?.type === 'connection') {
        mcpState.last_connection = { client: msg.client || 'unknown', at: new Date().toISOString() }
        broadcastMcpStatus()
      } else if (msg?.type === 'error') {
        mcpState.last_error = msg.error
        broadcastMcpStatus()
      }
    })

    child.on('exit', (code, signal) => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        mcpState.state = 'failed'
        mcpState.last_error = `connect exited unexpectedly: code=${code} signal=${signal}`
        broadcastMcpStatus()
        reject(new Error(mcpState.last_error))
        return
      }
      // 进程退出：标记 stopped
      if (mcpState.state !== 'stopped') {
        mcpState.state = 'stopped'
        mcpState.pid = null
        mcpState.port = null
        mcpState.url = null
        mcpState.process = null
        broadcastMcpStatus()
      }
    })

    child.on('error', (err) => {
      mcpState.last_error = err.message
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        mcpState.state = 'failed'
        broadcastMcpStatus()
        reject(err)
      }
    })
  })
}

async function stopMCPServer() {
  if (mcpState.state === 'stopped') return mcpStatus()
  mcpState.state = 'stopped'
  const proc = mcpState.process
  mcpState.process = null
  mcpState.pid = null
  mcpState.port = null
  mcpState.url = null
  broadcastMcpStatus()

  if (proc) {
    try {
      proc.kill('SIGTERM')
    } catch (err) {
      console.warn('[main] kill failed:', err.message)
    }
  }

  // 停止 Gateway
  if (authGateway) {
    try {
      await authGateway.stop()
    } catch (err) {
      console.warn('[main] gateway stop failed:', err.message)
    }
    authGateway = null
    mcpState.gateway_port = null
  }

  return mcpStatus()
}

async function restartMCPServer() {
  await stopMCPServer()
  return startMCPServer()
}

function mcpStatus() {
  return {
    state: mcpState.state,
    pid: mcpState.pid,
    port: mcpState.port,
    url: mcpState.url,
    started_at: mcpState.started_at,
    last_connection: mcpState.last_connection,
    last_error: mcpState.last_error
      ? { message: mcpState.last_error, at: new Date().toISOString() }
      : null,
    restart_count: mcpState.restart_count,
    gateway_port: mcpState.gateway_port,
  }
}

function getAPIBase() {
  const base = configuredApiBase
    ? configuredApiBase
    : (mcpState.gateway_port ? `http://127.0.0.1:${mcpState.gateway_port}/api` : currentApiBase())
  const out = ensureApiSuffix(base)
  // 调试：每次 IPC 调用都打一次，便于排查 baseURL 错误
  console.log(`[main] getAPIBase() → ${out}  (gateway_port=${mcpState.gateway_port}, backend=${currentBackendUrl})`)
  return out
}

function setAPIBase(apiBase) {
  const normalized = saveConfiguredApiBase(apiBase)
  configuredApiBase = normalized
  currentBackendUrl = apiBaseToBackendUrl(normalized)
  authManager.setBackendUrl(currentBackendUrl)
  if (authGateway) {
    authGateway.setBackendUrl(currentBackendUrl)
  }
  console.log(`[main] setAPIBase() → ${normalized} (backend=${currentBackendUrl})`)
  return { ok: true, apiBase: normalized }
}

function clearAPIBase() {
  try {
    if (fs.existsSync(SERVER_CONFIG_FILE)) fs.unlinkSync(SERVER_CONFIG_FILE)
  } catch (err) {
    console.warn('[main] clear server config failed:', err.message)
  }
  configuredApiBase = null
  currentBackendUrl = DEFAULT_BACKEND_URL.replace(/\/+$/, '')
  authManager.setBackendUrl(currentBackendUrl)
  if (authGateway) {
    authGateway.setBackendUrl(currentBackendUrl)
  }
  console.log(`[main] clearAPIBase() → backend=${currentBackendUrl}`)
  return { ok: true, apiBase: currentApiBase() }
}

function getIdeConfig() {
  return {
    stdio: {
      command: 'synkord-mcp',
      args: ['stdio'],
    },
    http: mcpState.url
      ? {
          url: mcpState.url,
          // 注意：HTTP 模式目前 Connect 监听自身端口；AuthGateway 在另一个端口
          // 这里返回的 token 不是必需的（IDE 通过 mcpGetStatus 自动取）
        }
      : null,
  }
}

// ============================================================================
// 401 处理（auth manager 回调）
// ============================================================================

function onUnauthorized() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('auth:expired')
  }
}

// ============================================================================
// IPC 注册
// ============================================================================

function registerIpc() {
  // 基础：渲染端拿 API base；handler 内部走 getAPIBase()（保证带 /api 后缀）
  ipcMain.handle('mcp:get-api-base', () => getAPIBase())
  ipcMain.handle('mcp:set-api-base', (_event, apiBase) => setAPIBase(apiBase))
  ipcMain.handle('mcp:clear-api-base', () => clearAPIBase())
  ipcMain.handle('app:get-version', () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
  }))
  ipcMain.handle('update:check', async () => {
    if (!autoUpdater) {
      return {
        status: 'unavailable',
        currentVersion: app.getVersion(),
        packaged: app.isPackaged,
        message: app.isPackaged ? '更新模块不可用' : '开发模式不支持在线更新',
      }
    }
    updateState.checking = true
    updateState.error = null
    try {
      const result = await autoUpdater.checkForUpdates()
      const info = result?.updateInfo || updateState.availableInfo
      updateState.checking = false
      if (updateState.availableInfo || (info?.version && info.version !== app.getVersion())) {
        return {
          status: 'available',
          currentVersion: app.getVersion(),
          latestVersion: (updateState.availableInfo || info).version,
          info: updateState.availableInfo || info,
        }
      }
      return {
        status: 'none',
        currentVersion: app.getVersion(),
        latestVersion: info?.version || app.getVersion(),
      }
    } catch (err) {
      updateState.checking = false
      updateState.error = err.message
      return {
        status: 'error',
        currentVersion: app.getVersion(),
        message: err.message,
      }
    }
  })
  ipcMain.handle('update:install', async () => {
    if (!autoUpdater) {
      return { status: 'unavailable', message: app.isPackaged ? '更新模块不可用' : '开发模式不支持在线更新' }
    }
    try {
      if (!updateState.downloaded) {
        updateState.downloading = true
        await autoUpdater.downloadUpdate()
        updateState.downloading = false
        updateState.downloaded = true
      }
      autoUpdater.quitAndInstall(false, true)
      return { status: 'installing' }
    } catch (err) {
      updateState.downloading = false
      updateState.error = err.message
      return { status: 'error', message: err.message }
    }
  })
  ipcMain.handle('auth:login', (_event, payload) => {
    return backendJsonRequest({
      apiBase: payload?.apiBase,
      path: '/auth/login',
      method: 'POST',
      body: { username: payload?.username, password: payload?.password },
    })
  })
  ipcMain.handle('auth:me', (_event, payload) => {
    return backendJsonRequest({
      apiBase: payload?.apiBase,
      path: '/auth/me',
      method: 'GET',
      token: payload?.token,
    })
  })

  // MCP 进程控制
  ipcMain.handle('mcp:get-status', () => mcpStatus())
  ipcMain.handle('mcp:start', () => startMCPServer())
  ipcMain.handle('mcp:stop', () => stopMCPServer())
  ipcMain.handle('mcp:restart', () => restartMCPServer())

  // 上下文：active contract（v1.2）
  ipcMain.handle('mcp:get-active-contract', () => activeContractStore.get())
  ipcMain.handle('mcp:set-active-contract', (_event, contract) => {
    if (!contract?.contract_id) {
      activeContractStore.clear()
      return activeContractStore.get()
    }
    activeContractStore.set(contract.contract_id, contract.contract_name || '')
    return activeContractStore.get()
  })
  ipcMain.handle('mcp:clear-active-contract', () => {
    activeContractStore.clear()
    return { ok: true }
  })

  // IDE 配置
  ipcMain.handle('mcp:get-ide-config', () => getIdeConfig())

  // 访问日志（v1.2：通过后端 API）
  ipcMain.handle('mcp:get-access-log', async (_e, limit) => {
    return getRecentAccessLog(limit || 50)
  })

  // 窗口控制
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.close())

  // ---- CLI 安装器（v0.1.0 起：桌面端自带 CLI） ----
  ipcMain.handle('cli:status', async () => {
    const installed = cliInstaller.isCLIInstalled()
    if (!installed.installed && !installed.path) {
      return {
        bundled: !!cliInstaller.locateBundledCLI(),
        installed: false,
        path: null,
        inPath: false,
        version: null,
      }
    }
    const run = await cliInstaller.runCLI()
    return {
      bundled: !!cliInstaller.locateBundledCLI(),
      installed: true,
      path: installed.path,
      inPath: installed.installed,
      version: run.ok ? run.output.replace(/^synkord\s+/, '') : null,
      runError: run.ok ? null : run.error,
    }
  })

  ipcMain.handle('cli:install', async () => {
    try {
      return await cliInstaller.installCLI()
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('cli:uninstall', async () => {
    try {
      return await cliInstaller.uninstallCLI()
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

// ============================================================================
// 访问日志读取（从本地文件）
// ============================================================================

function getRecentAccessLog(limit) {
  const logPath = path.join(SYNCORD_HOME, 'mcp-access.log')
  try {
    if (!fs.existsSync(logPath)) return { items: [], total: 0 }
    const content = fs.readFileSync(logPath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const items = lines.slice(-limit).reverse().map((line, idx) => {
      try {
        return JSON.parse(line)
      } catch {
        return { id: `parse-error-${idx}`, error: 'parse failed' }
      }
    })
    return { items, total: lines.length }
  } catch (err) {
    return { items: [], total: 0, error: err.message }
  }
}

// ============================================================================
// 浏览器窗口
// ============================================================================

const isDev = !app.isPackaged;
const devURL = process.env.SYNKORD_DEV_URL || 'http://127.0.0.1:3000';
let viteProcess = null;

function waitForPort(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function check() {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() > deadline) reject(new Error('port timeout'));
        else setTimeout(check, 200);
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('port timeout'));
        else setTimeout(check, 200);
      });
      req.setTimeout(2000, () => req.destroy());
    }
    check();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#f5f6fa',
    title: 'Synkord',
    // v1.2 修订：去掉系统顶栏，由前端 AppLayout 的 Header 充当拖拽区
    //  - frame: false  完全无边框（mac/win/linux 一致）
    //  - titleBarStyle  macOS 专属；win/linux 已无顶栏
    //  - backgroundMaterial  win11 亚克力效果（可省略）
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,  // preload 需要 require()
    },
  });

  // 打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  });

  // 加载前端
  if (isDev) {
    try {
      await waitForPort(devURL, 30000)  // dev 启动宽限 30s
      console.log(`[main] loading dev URL: ${devURL}`)
      mainWindow.loadURL(devURL)
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    } catch (err) {
      console.warn('[main] dev server not ready, falling back to file://')
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ============================================================================
// 启动 / 退出
// ============================================================================

app.whenReady().then(async () => {
  try {
    await authManager.init()
    console.log(`[main] auth-manager initialized, user=${authManager.getUser()?.username || 'anonymous'}`)
  } catch (err) {
    console.warn('[main] auth init failed:', err.message)
  }

  registerIpc()
  await createWindow()
  setupAutoUpdater()
})

/**
 * 集成 electron-updater：检查新版本、提示用户、重启安装
 * 流程：
 *   1. App 启动后 3 秒延迟检查（避免阻塞启动）
 *   2. 发现更新 → 弹窗"立即下载 / 稍后"
 *   3. 用户同意 → 后台下载，下载完成后再弹"立即重启 / 稍后"
 *   4. 重启前不阻塞，autoInstallOnAppQuit 让用户关闭时自动装
 */
function setupAutoUpdater() {
  if (!autoUpdater) return

  autoUpdater.on('checking-for-update', () => {
    updateState.checking = true
    console.log('[auto-update] checking for update…')
  })
  autoUpdater.on('update-available', (info) => {
    updateState.checking = false
    updateState.availableInfo = info
    updateState.downloaded = false
    console.log(`[auto-update] available: ${info.version}`)
  })
  autoUpdater.on('update-not-available', () => {
    updateState.checking = false
    updateState.availableInfo = null
    console.log('[auto-update] no update available')
  })
  autoUpdater.on('download-progress', (progress) => {
    updateState.downloading = true
    console.log(`[auto-update] downloading ${progress.percent.toFixed(1)}%`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    updateState.downloading = false
    updateState.downloaded = true
    updateState.availableInfo = info
    console.log(`[auto-update] downloaded ${info.version}`)
  })
  autoUpdater.on('error', (err) => {
    updateState.checking = false
    updateState.downloading = false
    updateState.error = err.message
    console.error('[auto-update] error:', err)
  })
}

app.on('window-all-closed', async () => {
  await stopMCPServer().catch(() => {})
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await stopMCPServer().catch(() => {})
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
