import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '../shared/ipc'
import type {
  SkyApi,
  MenuCommandPayload,
  FileResult,
  DirEntry,
  ExportRequest
} from '../shared/ipc'

const api: SkyApi = {
  onMenuCommand(handler) {
    const listener = (_e: unknown, payload: MenuCommandPayload) => handler(payload)
    ipcRenderer.on(Channels.menuCommand, listener)
    return () => ipcRenderer.removeListener(Channels.menuCommand, listener)
  },
  onRequestContent(handler) {
    const listener = () => handler()
    ipcRenderer.on(Channels.requestContent, listener)
    return () => ipcRenderer.removeListener(Channels.requestContent, listener)
  },
  openFile: () => ipcRenderer.invoke(Channels.dialogOpenFile) as Promise<FileResult | null>,
  openFolder: () => ipcRenderer.invoke(Channels.dialogOpenFolder) as Promise<string | null>,
  saveFile: (defaultPath, content) =>
    ipcRenderer.invoke(Channels.dialogSaveFile, defaultPath, content) as Promise<string | null>,
  readFile: (path) => ipcRenderer.invoke(Channels.fsReadFile, path) as Promise<FileResult | null>,
  writeFile: (path, content) =>
    ipcRenderer.invoke(Channels.fsWriteFile, path, content) as Promise<boolean>,
  readDir: (path) => ipcRenderer.invoke(Channels.fsReadDir, path) as Promise<DirEntry[]>,
  export: (req: ExportRequest) => ipcRenderer.invoke(Channels.fsExport, req) as Promise<string | null>,
  getRecent: () => ipcRenderer.invoke(Channels.recentGet) as Promise<string[]>,
  addRecent: (path) => ipcRenderer.invoke(Channels.recentAdd, path) as Promise<void>,
  onRecentChanged(handler) {
    const listener = (_e: unknown, paths: string[]) => handler(paths)
    ipcRenderer.on(Channels.recentChanged, listener)
    return () => ipcRenderer.removeListener(Channels.recentChanged, listener)
  },
  setTitle: (title) => ipcRenderer.send(Channels.windowSetTitle, title),
  setDirty: (dirty) => ipcRenderer.send(Channels.windowSetDirty, dirty),
  setAlwaysOnTop: (on) =>
    ipcRenderer.invoke(Channels.windowSetAlwaysOnTop, on) as Promise<boolean>
}

contextBridge.exposeInMainWorld('api', api)
