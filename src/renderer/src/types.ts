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
  /** Reset to a blank document and drop a visible caret in (File→New / new tab). */
  newDocument(): void
  /** Run an editor/format/paragraph/edit command. Return true if it was handled. */
  runCommand(id: CommandId, arg?: string): boolean
  onChange(cb: (md: string) => void): void
  /** Focus the editable surface; pass true to put the caret at the document end. */
  focus(atEnd?: boolean): void
  /** Toggle raw source view; returns the new state (true = source mode). */
  toggleSourceMode(): boolean
  isSourceMode(): boolean
  getOutline(): OutlineItem[]
  getStats(): EditorStats
  scrollToHeading(slug: string): void
  /** Toggle the browser spell-checker on the editable surface. */
  setSpellCheck(on: boolean): void
  /** Select the next match of `query` (wraps). Returns total match count. */
  findNext(query: string, caseSensitive?: boolean): number
  /** Replace the current match if selected, then advance. Returns remaining count. */
  replaceNext(query: string, replacement: string, caseSensitive?: boolean): number
  /** Replace every match in the document. Returns the number replaced. */
  replaceAll(query: string, replacement: string, caseSensitive?: boolean): number
  /** Render current document to standalone HTML (for export). */
  toHtml(): string
}

/** One open document in the tab strip. The editor always shows the active tab's
 *  content; `markdown` is the live snapshot, `baseline` is the last saved/loaded
 *  text used to derive `dirty` (dirty = markdown !== baseline). */
export interface TabState {
  id: string
  title: string
  path: string | null
  markdown: string
  baseline: string
  dirty: boolean
}

/** Top tab strip (txt-editor style). Owns the tab list + active id and renders the
 *  pills; the dispatcher orchestrates editor content swaps via the intent callbacks.
 *  Implemented in tabs/index.ts. */
export interface TabBarApi {
  readonly el: HTMLElement
  /** Create a tab, make it active, render, and return it. */
  add(init: { title: string; path?: string | null; markdown?: string }): TabState
  get(id: string): TabState | undefined
  active(): TabState | undefined
  list(): TabState[]
  /** Make the given tab active and re-render (does NOT touch the editor). */
  setActive(id: string): void
  /** Remove a tab; if it was active, activate a neighbour. Re-renders. */
  remove(id: string): void
  findByPath(path: string): TabState | undefined
  /** Merge a patch into a tab and re-render. */
  update(id: string, patch: Partial<TabState>): void
  render(): void
  /** User clicked a tab pill (intent to switch). */
  onSelect(cb: (id: string) => void): void
  /** User clicked a tab's close button. */
  onCloseIntent(cb: (id: string) => void): void
  /** User clicked the "+" new-tab button. */
  onNew(cb: () => void): void
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
