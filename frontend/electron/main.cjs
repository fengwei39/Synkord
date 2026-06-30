const { app, BrowserWindow, ipcMain } = require('electron');
const { fork } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');

const isDev = !app.isPackaged;
const devURL = process.env.SYNKORD_DEV_URL || 'http://127.0.0.1:3000';
const mcpPort = Number(process.env.SYNKORD_LOCAL_MCP_PORT || 37991);
const mcpPath = '/mcp';

// 激活上下文文件目录：优先使用 SYNKORD_HOME，否则回退到用户主目录下 ~/.synkord
const synkordHome = process.env.SYNKORD_HOME || path.join(os.homedir(), '.synkord');
const activeContextPath = path.join(synkordHome, 'active-context.json');

let localMCPProcess = null;
let activeProject = null;

function getAPIBase() {
  return process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000/api';
}

function waitForDevServer(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        setTimeout(check, 500);
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    };
    check();
  });
}

function ensureSynkordHome() {
  try {
    if (!fs.existsSync(synkordHome)) {
      fs.mkdirSync(synkordHome, { recursive: true, mode: 0o700 });
    }
  } catch (e) {
    console.error('[synkord] failed to ensure SYNKORD_HOME', synkordHome, e);
  }
}

function writeActiveContext() {
  ensureSynkordHome();
  const payload = {
    team_id: activeProject ? activeProject.teamId : null,
    project_id: activeProject ? activeProject.projectId : null,
    project_name: activeProject ? activeProject.projectName : null,
    synkord_core_url: getAPIBase(),
    updated_at: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(activeContextPath, JSON.stringify(payload, null, 2), { mode: 0o600 });
  } catch (e) {
    console.error('[synkord] failed to write active-context.json', activeContextPath, e);
  }
}

function mcpStatus() {
  return {
    running: !!localMCPProcess,
    port: mcpPort,
    url: `http://127.0.0.1:${mcpPort}${mcpPath}`,
    activeProject,
    synkordHome,
    activeContextPath,
    pid: localMCPProcess?.pid || null,
  };
}

function startLocalMCPServer() {
  if (localMCPProcess) {
    return Promise.resolve(mcpStatus());
  }

  // 启动前先写一份 active-context.json，确保本地 MCP 服务读取时一定有值
  writeActiveContext();

  const servicePath = path.join(__dirname, 'local-mcp-service.cjs');
  localMCPProcess = fork(servicePath, ['--synkord-home', synkordHome], {
    env: {
      ...process.env,
      SYNKORD_API_BASE: getAPIBase(),
      SYNKORD_LOCAL_MCP_PORT: String(mcpPort),
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  localMCPProcess.stdout?.on('data', (chunk) => console.log(`[synkord-local-mcp] ${chunk.toString().trim()}`));
  localMCPProcess.stderr?.on('data', (chunk) => console.error(`[synkord-local-mcp] ${chunk.toString().trim()}`));
  localMCPProcess.on('exit', () => {
    localMCPProcess = null;
  });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const proc = localMCPProcess;
      localMCPProcess = null;
      proc?.kill();
      reject(new Error('local MCP service startup timed out'));
    }, 5000);

    localMCPProcess.once('error', (error) => {
      clearTimeout(timeout);
      localMCPProcess = null;
      reject(error);
    });

    localMCPProcess.on('message', (message) => {
      if (message?.type === 'ready') {
        clearTimeout(timeout);
        sendActiveProjectToLocalMCP();
        resolve(mcpStatus());
      }
      if (message?.type === 'error') {
        clearTimeout(timeout);
        reject(new Error(message.error || 'local MCP service failed'));
      }
    });
  });
}

function stopLocalMCPServer() {
  if (!localMCPProcess) {
    return Promise.resolve(mcpStatus());
  }
  const proc = localMCPProcess;
  localMCPProcess = null;
  return new Promise((resolve) => {
    proc.once('exit', () => resolve(mcpStatus()));
    proc.send?.({ type: 'shutdown' });
    setTimeout(() => {
      if (!proc.killed) {
        proc.kill();
      }
      resolve(mcpStatus());
    }, 1000);
  });
}

function sendActiveProjectToLocalMCP() {
  writeActiveContext();
  if (localMCPProcess?.connected) {
    localMCPProcess.send({
      type: 'set-active-project',
      project: activeProject,
    });
  }
}

async function createWindow() {
  const win = new BrowserWindow({
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
    const ready = await waitForDevServer(devURL);
    if (ready) {
      win.loadURL(devURL);
      win.webContents.openDevTools({ mode: 'detach' });
    } else {
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
        <html>
          <body style="font-family: system-ui; padding: 32px; color: #1f2937;">
            <h2>Synkord 前端开发服务未启动</h2>
            <p>Electron 开发模式需要先启动 Vite：</p>
            <pre style="background:#f3f4f6;padding:16px;border-radius:6px;">cd D:\\code\\synkord\\frontend
pnpm dev</pre>
            <p>然后重新运行：</p>
            <pre style="background:#f3f4f6;padding:16px;border-radius:6px;">pnpm electron</pre>
            <p>当前尝试连接：${devURL}</p>
          </body>
        </html>
      `)}`);
    }
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('synkord:get-api-base', () => {
    return getAPIBase();
  });
  ipcMain.handle('synkord:mcp:get-status', () => mcpStatus());
  ipcMain.handle('synkord:mcp:start', () => startLocalMCPServer());
  ipcMain.handle('synkord:mcp:stop', () => stopLocalMCPServer());
  ipcMain.handle('synkord:mcp:restart', async () => {
    await stopLocalMCPServer();
    return startLocalMCPServer();
  });
  ipcMain.handle('synkord:mcp:set-active-project', (_event, project) => {
    activeProject = project && project.teamId && project.projectId ? {
      teamId: String(project.teamId),
      projectId: String(project.projectId),
      projectName: String(project.projectName || ''),
    } : null;
    sendActiveProjectToLocalMCP();
    return mcpStatus();
  });
  ipcMain.handle('synkord:mcp:get-ide-config', () => {
    return {
      url: `http://127.0.0.1:${mcpPort}${mcpPath}`,
      template: {
        mcpServers: {
          synkord: {
            url: `http://127.0.0.1:${mcpPort}${mcpPath}`,
            headers: { Authorization: 'Bearer ${SYNKORD_MCP_TOKEN}' },
          },
        },
      },
    };
  });
  ipcMain.on('synkord:window-control', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    if (action === 'maximize') {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
    if (action === 'close') win.close();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
