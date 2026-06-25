const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');

const isDev = !app.isPackaged;
const devURL = process.env.SYNKORD_DEV_URL || 'http://127.0.0.1:3000';

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

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Synkord',
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
    return process.env.SYNKORD_API_BASE || 'http://127.0.0.1:8000/api';
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
