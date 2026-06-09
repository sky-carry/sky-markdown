import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { Channels } from '../shared/ipc'
import { createAppMenu } from './menu'
import { registerFileHandlers, getRecent } from './fileManager'

let mainWindow: BrowserWindow | null = null

function getWindow(): BrowserWindow | null {
  return mainWindow
}

/** Rebuild and install the application menu (called on launch and when recents change). */
export function refreshMenu(): void {
  if (!mainWindow) return
  const menu = createAppMenu(mainWindow, getRecent())
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 420,
    title: 'Sky Markdown',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Window-state IPC from renderer
  ipcMain.on(Channels.windowSetTitle, (_e, title: string) => {
    mainWindow?.setTitle(title || 'Sky Markdown')
  })
  ipcMain.on(Channels.windowSetDirty, (_e, dirty: boolean) => {
    if (!mainWindow) return
    mainWindow.setDocumentEdited(dirty)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-finish-load', () => {
    refreshMenu()
  })
}

app.whenReady().then(() => {
  registerFileHandlers(getWindow, refreshMenu)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
