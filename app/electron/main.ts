import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { watchDirectory, stopWatcher } from './watcher'
import { startMCPServer, setMCPToken, stopMCPServer } from './mcp'
import { createTray, updateTrayBadge } from './tray'

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const API_BASE = process.env.VITE_API_URL ?? 'http://localhost:8080'

let mainWin: BrowserWindow | null = null
let overlayWin: BrowserWindow | null = null

// ─── Window factories ─────────────────────────────────────────────────────────

function createMainWindow(): void {
  mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
    },
  })

  mainWin.on('ready-to-show', () => mainWin?.show())

  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWin.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    mainWin.webContents.openDevTools()
  } else {
    mainWin.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createOverlayWindow(): void {
  overlayWin = new BrowserWindow({
    width: 320,
    height: 500,
    x: 20,
    y: 100,
    alwaysOnTop: true,
    frame: false,
    resizable: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
    },
  })

  const baseURL = isDev
    ? (process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    : `file://${join(__dirname, '../renderer/index.html')}`

  overlayWin.loadURL(`${baseURL}#/overlay`)
  overlayWin.on('closed', () => { overlayWin = null })
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIPC(): void {
  // Open external URL from renderer
  ipcMain.handle('open-external', (_e, url: string) => {
    shell.openExternal(url)
  })

  // Overlay: set watch directory
  ipcMain.handle('overlay:watch-dir', (_e, dir: string) => {
    watchDirectory(dir, (cfg, watchedDir) => {
      overlayWin?.webContents.send('overlay:config-changed', cfg)
      mainWin?.webContents.send('overlay:config-changed', cfg)
      console.log(`[watcher] ${watchedDir} →`, cfg?.project ?? 'no config')
    })
  })

  // Overlay: pick directory via OS dialog
  ipcMain.handle('overlay:pick-dir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? mainWin ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: '选择项目目录',
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // MCP: set auth token
  ipcMain.handle('mcp:set-token', (_e, token: string) => {
    setMCPToken(token)
  })

  // Tray: update unread badge
  ipcMain.handle('tray:set-badge', (_e, count: number) => {
    updateTrayBadge(count)
  })

  // File system: pick a file
  ipcMain.handle('fs:pick-file', async (e, filters?: { name: string; extensions: string[] }[]) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? mainWin ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'All Files', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // File system: write text file (creates parent directories automatically)
  ipcMain.handle('fs:write-file', (_e, filePath: string, content: string) => {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, content, 'utf8')
    } catch (err) {
      throw new Error(`Cannot write file: ${String(err)}`)
    }
  })

  // File system: read text file
  ipcMain.handle('fs:read-text', (_e, filePath: string) => {
    try {
      return readFileSync(filePath, 'utf8')
    } catch (err) {
      throw new Error(`Cannot read file: ${String(err)}`)
    }
  })

  // File system: read directory tree (1 level deep)
  ipcMain.handle('fs:read-dir-tree', (_e, dirPath: string) => {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true })
      return entries.map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
        path: join(dirPath, e.name),
      }))
    } catch (err) {
      throw new Error(`Cannot read directory: ${String(err)}`)
    }
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIPC()
  createMainWindow()
  createOverlayWindow()

  // Start MCP server
  startMCPServer(API_BASE)

  // Create tray (pass null initially, update after windows are ready)
  if (mainWin) {
    createTray(mainWin, overlayWin)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopWatcher()
    stopMCPServer()
    app.quit()
  }
})
