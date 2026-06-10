import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'

let tray: Tray | null = null
let unreadCount = 0

export function createTray(
  mainWin: BrowserWindow,
  overlayWin: BrowserWindow | null,
): Tray {
  // Create a simple 16x16 coloured icon programmatically
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,' +
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
    'MElEQVQ4T2NkYGD4z8BAAoxquBkwasCoAaMGjBpAowAABhAA' +
    'AQAAQAAQAAYgAAEAYQABBmEAAQAA',
  )

  tray = new Tray(icon)
  updateTrayMenu(mainWin, overlayWin)
  return tray
}

export function updateTrayBadge(count: number): void {
  unreadCount = count
  if (tray) {
    tray.setToolTip(count > 0 ? `Synkord — ${count} 条未读通知` : 'Synkord')
  }
}

function updateTrayMenu(mainWin: BrowserWindow, overlayWin: BrowserWindow | null): void {
  if (!tray) return

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Synkord',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '显示主窗口',
        click: () => {
          mainWin.show()
          mainWin.focus()
        },
      },
      {
        label: overlayWin?.isVisible() ? '隐藏悬浮看板' : '显示悬浮看板',
        click: () => {
          if (overlayWin?.isVisible()) {
            overlayWin.hide()
          } else {
            overlayWin?.show()
          }
          updateTrayMenu(mainWin, overlayWin)
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        role: 'quit',
      },
    ]),
  )

  tray.setToolTip(unreadCount > 0 ? `Synkord — ${unreadCount} 条未读通知` : 'Synkord')
}
