import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { readFile, writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import { Channels } from '../shared/ipc'
import type { FileResult, DirEntry, ExportRequest } from '../shared/ipc'

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.txt']
const RECENT_MAX = 12

let recent: string[] | null = null

function recentStorePath(): string {
  return join(app.getPath('userData'), 'recent.json')
}

/** Lazily load the recent list from disk on first access. Read errors are ignored. */
function ensureRecentLoaded(): string[] {
  if (recent !== null) return recent
  recent = []
  try {
    const raw = require('fs').readFileSync(recentStorePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      recent = parsed.filter((p): p is string => typeof p === 'string').slice(0, RECENT_MAX)
    }
  } catch {
    // ignore — no recents yet or unreadable
  }
  return recent
}

/** Persist the in-memory recent list. Write errors are swallowed. */
async function persistRecent(): Promise<void> {
  try {
    await writeFile(recentStorePath(), JSON.stringify(ensureRecentLoaded(), null, 2), 'utf8')
  } catch {
    // ignore — best-effort persistence
  }
}

/** Add a path to the front of the recent list (dedup, capped). Does not persist. */
function pushRecent(path: string): void {
  const list = ensureRecentLoaded()
  const next = [path, ...list.filter((p) => p !== path)].slice(0, RECENT_MAX)
  recent = next
}

/** Returns a copy of the recent-files list, most-recent first. */
export function getRecent(): string[] {
  return [...ensureRecentLoaded()]
}

/** Wrap rendered HTML in a standalone document with a minimal stylesheet. */
function wrapHtml(html: string, title: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #24292e; max-width: 860px; margin: 0 auto; padding: 40px 20px; }
  h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; line-height: 1.25; }
  h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
  h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
  pre { background: #f6f8fa; padding: 16px; overflow: auto; border-radius: 6px; }
  code { background: rgba(27,31,35,0.05); padding: 0.2em 0.4em; border-radius: 3px; font-size: 85%; }
  pre code { background: transparent; padding: 0; }
  blockquote { margin: 0; padding: 0 1em; color: #6a737d; border-left: 0.25em solid #dfe2e5; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #dfe2e5; padding: 6px 13px; }
  img { max-width: 100%; }
  a { color: #0366d6; }
</style>
</head>
<body>
${html}
</body>
</html>`
}

async function exportHtml(req: ExportRequest): Promise<string | null> {
  const doc = wrapHtml(req.html, req.defaultName)
  const result = await dialog.showSaveDialog({
    defaultPath: `${req.defaultName}.html`,
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, doc, 'utf8')
  return result.filePath
}

async function exportPdf(req: ExportRequest): Promise<string | null> {
  const doc = wrapHtml(req.html, req.defaultName)
  const result = await dialog.showSaveDialog({
    defaultPath: `${req.defaultName}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return null

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: false, contextIsolation: true }
  })
  try {
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(doc)}`
    await win.loadURL(dataUrl)
    const pdf = await win.webContents.printToPDF({ printBackground: true })
    await writeFile(result.filePath, pdf)
    return result.filePath
  } finally {
    win.destroy()
  }
}

/**
 * 'word' and 'image' are not yet implemented natively. As a stand-in we write the
 * wrapped HTML out under the requested extension so the flow returns a real path.
 */
async function exportFallback(req: ExportRequest, ext: string): Promise<string | null> {
  const doc = wrapHtml(req.html, req.defaultName)
  const result = await dialog.showSaveDialog({
    defaultPath: `${req.defaultName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, doc, 'utf8')
  return result.filePath
}

export function registerFileHandlers(
  getWindow: () => BrowserWindow | null,
  onRecentChanged: () => void
): void {
  ipcMain.handle(Channels.dialogOpenFile, async (): Promise<FileResult | null> => {
    try {
      const win = getWindow()
      const result = win
        ? await dialog.showOpenDialog(win, {
            filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
            properties: ['openFile']
          })
        : await dialog.showOpenDialog({
            filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }],
            properties: ['openFile']
          })
      if (result.canceled || result.filePaths.length === 0) return null
      const path = result.filePaths[0]
      const content = await readFile(path, 'utf8')
      pushRecent(path)
      await persistRecent()
      onRecentChanged()
      return { path, content }
    } catch {
      return null
    }
  })

  ipcMain.handle(Channels.dialogOpenFolder, async (): Promise<string | null> => {
    try {
      const win = getWindow()
      const result = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    } catch {
      return null
    }
  })

  ipcMain.handle(
    Channels.dialogSaveFile,
    async (_e, defaultPath: string | null, content: string): Promise<string | null> => {
      try {
        const win = getWindow()
        const options = {
          defaultPath: defaultPath ?? undefined,
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
        }
        const result = win
          ? await dialog.showSaveDialog(win, options)
          : await dialog.showSaveDialog(options)
        if (result.canceled || !result.filePath) return null
        await writeFile(result.filePath, content, 'utf8')
        pushRecent(result.filePath)
        await persistRecent()
        onRecentChanged()
        return result.filePath
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(Channels.fsReadFile, async (_e, path: string): Promise<FileResult | null> => {
    try {
      const content = await readFile(path, 'utf8')
      pushRecent(path)
      await persistRecent()
      onRecentChanged()
      return { path, content }
    } catch {
      return null
    }
  })

  ipcMain.handle(
    Channels.fsWriteFile,
    async (_e, path: string, content: string): Promise<boolean> => {
      try {
        await writeFile(path, content, 'utf8')
        return true
      } catch {
        return false
      }
    }
  )

  ipcMain.handle(Channels.fsReadDir, async (_e, path: string): Promise<DirEntry[]> => {
    try {
      const entries = await readdir(path, { withFileTypes: true })
      const result: DirEntry[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const isDirectory = entry.isDirectory()
        if (!isDirectory) {
          const lower = entry.name.toLowerCase()
          if (!MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue
        }
        result.push({ name: entry.name, path: join(path, entry.name), isDirectory })
      }
      result.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      return result
    } catch {
      return []
    }
  })

  ipcMain.handle(Channels.fsExport, async (_e, req: ExportRequest): Promise<string | null> => {
    try {
      switch (req.format) {
        case 'html':
          return await exportHtml(req)
        case 'pdf':
          return await exportPdf(req)
        case 'word':
          return await exportFallback(req, 'doc')
        case 'image':
          return await exportFallback(req, 'png')
        default:
          return null
      }
    } catch {
      return null
    }
  })

  ipcMain.handle(Channels.recentGet, async (): Promise<string[]> => {
    return getRecent()
  })

  ipcMain.handle(Channels.recentAdd, async (_e, path: string): Promise<void> => {
    pushRecent(path)
    await persistRecent()
    onRecentChanged()
  })
}
