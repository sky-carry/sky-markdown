import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { Channels } from '../shared/ipc'
import { createAppMenu } from './menu'
import { registerFileHandlers, getRecent } from './fileManager'

// 某些环境（远程桌面 RDP / 虚拟机 / 缺少 GPU 驱动 / 安全软件拦截）下，Chromium 的
// GPU 子进程根本启动不起来（"GPU process launch failed: error_code=65"），随后触发
// "GPU process isn't usable. Goodbye." 直接退出。处理思路是：用软件渲染，并避免单独
// 拉起 GPU 子进程。
//   - disableHardwareAcceleration + disable-gpu：不使用硬件 GPU，改走软件渲染
//   - in-process-gpu：把 GPU 工作放进主进程，不再单独拉 GPU 子进程（避免 error_code=65）
// 注意：绝对不能加 --disable-software-rasterizer —— 它会把软件渲染（SwiftShader）也关掉，
//      于是硬件、软件两条路都断了，整个页面画不出来变纯白。软件光栅必须保持开启。
// 想强制开启硬件加速时，设置环境变量 SKY_ENABLE_GPU=1 即可跳过整段。
if (!process.env.SKY_ENABLE_GPU) {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('in-process-gpu')
}

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
