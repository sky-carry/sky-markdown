/** Shared renderer-side interfaces. Each UI module implements one of these so the
 *  bootstrap (main.ts) and command dispatcher can wire them without knowing internals. */
import type { CommandId, ThemeId } from '../../shared/commands'

export interface OutlineItem {
  level: number
  text: string
  slug: string
}

export interface EditorStats {
  words: number
  chars: number
  lines: number
  readMinutes: number
}

/** The WYSIWYG editor (Milkdown). Implemented in editor/index.ts. */
export interface EditorApi {
  /** Mount the editor into the given container. */
  mount(container: HTMLElement): Promise<void>
  getMarkdown(): string
  setMarkdown(md: string): void
  /** Run an editor/format/paragraph/edit command. Return true if it was handled. */
  runCommand(id: CommandId, arg?: string): boolean
  onChange(cb: (md: string) => void): void
  focus(): void
  /** Toggle raw source view; returns the new state (true = source mode). */
  toggleSourceMode(): boolean
  isSourceMode(): boolean
  getOutline(): OutlineItem[]
  getStats(): EditorStats
  scrollToHeading(slug: string): void
  /** Toggle the browser spell-checker on the editable surface. */
  setSpellCheck(on: boolean): void
  /** Render current document to standalone HTML (for export). */
  toHtml(): string
}

export type SidebarPanel = 'files' | 'outline'

/** Left sidebar with two tabs: file tree (文件) and outline (大纲).
 *  Implemented in sidebar/index.ts. */
export interface SidebarApi {
  readonly el: HTMLElement
  toggle(): boolean
  show(panel: SidebarPanel): void
  isVisible(): boolean
  setOutline(items: OutlineItem[]): void
  setFolder(path: string): Promise<void>
  onOpenFile(cb: (path: string) => void): void
  onJumpHeading(cb: (slug: string) => void): void
}

/** Bottom status bar. Implemented in statusbar/index.ts. */
export interface StatusBarApi {
  readonly el: HTMLElement
  setStats(stats: EditorStats): void
  setSourceMode(on: boolean): void
  setSpellCheck(on: boolean): void
  setVisible(visible: boolean): void
  onToggleSidebar(cb: () => void): void
  onToggleSource(cb: () => void): void
  /** Fired when the spell-check button is clicked; passes the new on/off state. */
  onToggleSpellCheck(cb: (on: boolean) => void): void
  /** Open/close the detailed word-count popover (also used by the View menu). */
  toggleWordCount(): void
}

/** Theme manager. Implemented in theme/index.ts. */
export interface ThemeApi {
  apply(id: ThemeId): void
  current(): ThemeId
}
