/**
 * IPC channel contract shared by main, preload and renderer.
 * Keep this the single source of truth for channel names and payload shapes.
 */
import type { CommandId } from './commands'

export const Channels = {
  /** main -> renderer: a menu command was triggered */
  menuCommand: 'menu:command',
  /** renderer -> main: invoke a file dialog / fs operation */
  dialogOpenFile: 'dialog:openFile',
  dialogOpenFolder: 'dialog:openFolder',
  dialogSaveFile: 'dialog:saveFile',
  fsReadFile: 'fs:readFile',
  fsWriteFile: 'fs:writeFile',
  fsReadDir: 'fs:readDir',
  fsExport: 'fs:export',
  recentGet: 'recent:get',
  recentAdd: 'recent:add',
  /** renderer -> main: report dirty / title state so the window chrome can update */
  windowSetTitle: 'window:setTitle',
  windowSetDirty: 'window:setDirty',
  /** renderer -> main: toggle "keep window on top"; returns the new boolean state */
  windowSetAlwaysOnTop: 'window:setAlwaysOnTop',
  /** main -> renderer: app asks renderer for current markdown (e.g. before save) */
  requestContent: 'editor:requestContent',
  /** main -> renderer: rebuild the recent-files submenu */
  recentChanged: 'recent:changed'
} as const

export interface MenuCommandPayload {
  id: CommandId
  /** optional extra data, e.g. a recent file path or export target */
  arg?: string
}

export interface FileResult {
  path: string
  content: string
}

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

export type ExportFormat = 'pdf' | 'html' | 'word' | 'image'

export interface ExportRequest {
  format: ExportFormat
  html: string
  defaultName: string
}

/** The API surface exposed on `window.api` by the preload bridge. */
export interface SkyApi {
  onMenuCommand(handler: (payload: MenuCommandPayload) => void): () => void
  onRequestContent(handler: () => void): () => void
  openFile(): Promise<FileResult | null>
  openFolder(): Promise<string | null>
  saveFile(defaultPath: string | null, content: string): Promise<string | null>
  readFile(path: string): Promise<FileResult | null>
  writeFile(path: string, content: string): Promise<boolean>
  readDir(path: string): Promise<DirEntry[]>
  export(req: ExportRequest): Promise<string | null>
  getRecent(): Promise<string[]>
  addRecent(path: string): Promise<void>
  onRecentChanged(handler: (paths: string[]) => void): () => void
  setTitle(title: string): void
  setDirty(dirty: boolean): void
  /** Toggle "keep window on top"; resolves to the new state. */
  setAlwaysOnTop(on: boolean): Promise<boolean>
}
