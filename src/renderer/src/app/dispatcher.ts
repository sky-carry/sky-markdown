import { Cmd } from '../../../shared/commands'
import type { CommandId, ThemeId } from '../../../shared/commands'
import type { EditorApi, SidebarApi, StatusBarApi, TabBarApi, TabState, ThemeApi } from '../types'
import { createFindBar, type FindBarApi } from '../find'

interface Deps {
  editor: EditorApi
  sidebar: SidebarApi
  statusbar: StatusBarApi
  tabs: TabBarApi
  theme: ThemeApi
  appEl: HTMLElement
  /** Host for the floating find/replace panel (the content area). */
  contentEl: HTMLElement
}

/**
 * Routes every menu command to the right subsystem and owns the open documents'
 * lifecycle. Each open file/new doc is a tab; the editor always shows the active
 * tab's content. A tab's dirty flag is derived by comparing the live markdown to
 * the last saved/loaded `baseline` — robust against the editor's debounced change
 * events. It is intentionally the only place that knows how the modules fit
 * together.
 */
export class Dispatcher {
  private zoom = 1
  private untitledSeq = 0
  private alwaysOnTop = false
  private find: FindBarApi

  constructor(private d: Deps) {
    this.find = createFindBar(d.contentEl, d.editor)
  }

  init(welcomeMarkdown: string): void {
    this.d.editor.onChange((md) => this.onDocChanged(md))
    this.d.sidebar.onOpenFile((p) => this.openPath(p))
    this.d.sidebar.onJumpHeading((slug) => this.d.editor.scrollToHeading(slug))
    this.d.statusbar.onToggleSidebar(() => this.run(Cmd.viewToggleSidebar))
    this.d.statusbar.onToggleSource(() => this.run(Cmd.viewSourceMode))
    this.d.statusbar.onToggleSpellCheck((on) => this.d.editor.setSpellCheck(on))

    // Tab intents.
    this.d.tabs.onSelect((id) => this.switchTab(id))
    this.d.tabs.onCloseIntent((id) => this.closeTab(id))
    this.d.tabs.onNew(() => this.newDoc())

    // Seed the first tab with the welcome document.
    const tab = this.d.tabs.add({ title: '欢迎', path: null, markdown: welcomeMarkdown })
    this.d.editor.setMarkdown(welcomeMarkdown)
    tab.baseline = this.d.editor.getMarkdown()
    tab.markdown = tab.baseline
    tab.dirty = false
    this.refreshDerived()
    this.syncWindow()
    requestAnimationFrame(() => this.d.editor.focus())
  }

  /** Entry point for menu commands. */
  run(id: CommandId, arg?: string): void {
    // 1) Let the editor claim editor/format/paragraph/edit commands first.
    if (this.d.editor.runCommand(id, arg)) {
      return
    }
    // 2) Otherwise route by domain.
    switch (id) {
      case Cmd.fileNew:
      case Cmd.fileNewWindow:
        this.newDoc()
        break
      case Cmd.fileOpen:
        this.openDialog()
        break
      case Cmd.fileOpenFolder:
        this.openFolder()
        break
      case Cmd.fileOpenRecent:
        if (arg) this.openPath(arg)
        break
      case Cmd.fileSave:
        this.save(false)
        break
      case Cmd.fileSaveAs:
        this.save(true)
        break
      case Cmd.fileSaveAll:
        this.saveAll()
        break
      case Cmd.fileClose:
        this.closeActive()
        break
      case Cmd.filePrint:
        window.print()
        break
      case Cmd.fileExportHtml:
      case Cmd.fileExportPdf:
      case Cmd.fileExportWord:
      case Cmd.fileExportImage:
        this.exportDoc(id)
        break

      case Cmd.editFindReplace:
        this.find.toggle()
        break

      case Cmd.viewToggleSidebar:
        this.d.sidebar.toggle()
        this.d.appEl.classList.toggle('sidebar-collapsed', !this.d.sidebar.isVisible())
        break
      case Cmd.viewOutline:
        this.ensureSidebar('outline')
        break
      case Cmd.viewFileList:
      case Cmd.viewFileTree:
      case Cmd.viewSearch:
        this.ensureSidebar('files')
        break
      case Cmd.viewSourceMode:
        this.d.statusbar.setSourceMode(this.d.editor.toggleSourceMode())
        break
      case Cmd.viewFocusMode:
        this.d.appEl.classList.toggle('focus-mode')
        break
      case Cmd.viewTypewriterMode:
        this.d.appEl.classList.toggle('typewriter-mode')
        break
      case Cmd.viewStatusBar:
        this.toggleStatusBar()
        break
      case Cmd.viewWordCount:
        this.d.statusbar.toggleWordCount()
        break
      case Cmd.viewAlwaysOnTop:
        this.toggleAlwaysOnTop()
        break
      case Cmd.viewActualSize:
        this.setZoom(1)
        break
      case Cmd.viewZoomIn:
        this.setZoom(this.zoom + 0.1)
        break
      case Cmd.viewZoomOut:
        this.setZoom(this.zoom - 0.1)
        break

      case Cmd.themeGithub:
        this.applyTheme('github')
        break
      case Cmd.themeNewsprint:
        this.applyTheme('newsprint')
        break
      case Cmd.themeNight:
        this.applyTheme('night')
        break
      case Cmd.themePixyll:
        this.applyTheme('pixyll')
        break
      case Cmd.themeWhitey:
        this.applyTheme('whitey')
        break

      case Cmd.helpAbout:
        alert('Sky Markdown 0.1.0\n一个 Typora 风格的 Markdown 编辑器\n基于 Electron + Milkdown')
        break
      case Cmd.helpWebsite:
        window.open('https://github.com', '_blank')
        break

      default:
        // Unhandled command — no-op (keeps unknown future ids safe).
        break
    }
  }

  // ---- tab + document lifecycle ----

  /** Persist the editor's current content into the active tab and recompute dirty. */
  private stashActive(): void {
    const tab = this.d.tabs.active()
    if (!tab) return
    tab.markdown = this.d.editor.getMarkdown()
    tab.dirty = tab.markdown !== tab.baseline
  }

  /** Load a tab's content into the editor (preserving its dirty state). */
  private showTab(tab: TabState): void {
    this.d.editor.setMarkdown(tab.markdown)
    this.refreshDerived()
    this.syncWindow()
    requestAnimationFrame(() => this.d.editor.focus())
  }

  private nextUntitledTitle(): string {
    this.untitledSeq += 1
    return `未命名-${this.untitledSeq}`
  }

  private newDoc(): void {
    this.stashActive()
    this.d.tabs.add({ title: this.nextUntitledTitle(), path: null, markdown: '' })
    this.d.editor.newDocument()
    this.refreshDerived()
    this.syncWindow()
  }

  private async openDialog(): Promise<void> {
    const res = await window.api.openFile()
    if (res) this.loadFile(res.path, res.content)
  }

  private async openPath(path: string): Promise<void> {
    const existing = this.d.tabs.findByPath(path)
    if (existing) {
      this.switchTab(existing.id)
      return
    }
    const res = await window.api.readFile(path)
    if (res) this.loadFile(res.path, res.content)
  }

  private loadFile(path: string, content: string): void {
    // Already open? Just switch to it.
    const existing = this.d.tabs.findByPath(path)
    if (existing) {
      this.switchTab(existing.id)
      return
    }

    const title = baseName(path)
    const current = this.d.tabs.active()
    // Reuse a pristine untitled tab (e.g. the initial welcome / a blank new tab)
    // instead of piling up an empty tab next to the opened file.
    if (current && current.path === null && !current.dirty) {
      current.path = path
      current.title = title
      this.d.editor.setMarkdown(content)
      current.baseline = this.d.editor.getMarkdown()
      current.markdown = current.baseline
      current.dirty = false
      this.d.tabs.render()
    } else {
      this.stashActive()
      const tab = this.d.tabs.add({ title, path, markdown: content })
      this.d.editor.setMarkdown(content)
      tab.baseline = this.d.editor.getMarkdown()
      tab.markdown = tab.baseline
      tab.dirty = false
    }
    window.api.addRecent(path)
    this.refreshDerived()
    this.syncWindow()
    requestAnimationFrame(() => this.d.editor.focus())
  }

  private switchTab(id: string): void {
    const current = this.d.tabs.active()
    if (current && current.id === id) return
    this.stashActive()
    this.d.tabs.setActive(id)
    const tab = this.d.tabs.active()
    if (tab) this.showTab(tab)
  }

  private async openFolder(): Promise<void> {
    const folder = await window.api.openFolder()
    if (folder) {
      await this.d.sidebar.setFolder(folder)
      this.ensureSidebar('files')
    }
  }

  private async save(forceDialog: boolean): Promise<void> {
    const tab = this.d.tabs.active()
    if (!tab) return
    const md = this.d.editor.getMarkdown()
    tab.markdown = md
    if (tab.path && !forceDialog) {
      const ok = await window.api.writeFile(tab.path, md)
      if (ok) this.markSaved(tab, md)
      return
    }
    const newPath = await window.api.saveFile(tab.path, md)
    if (newPath) {
      tab.path = newPath
      tab.title = baseName(newPath)
      this.markSaved(tab, md)
      window.api.addRecent(newPath)
    }
  }

  private async saveAll(): Promise<void> {
    // Make sure the active tab's latest edits are captured first.
    this.stashActive()
    for (const tab of this.d.tabs.list()) {
      if (!tab.dirty || !tab.path) continue
      const ok = await window.api.writeFile(tab.path, tab.markdown)
      if (ok) this.markSaved(tab, tab.markdown)
    }
    // Any dirty untitled tabs still need a Save-As; do the active one if applicable.
    const active = this.d.tabs.active()
    if (active && active.dirty && !active.path) await this.save(false)
  }

  private markSaved(tab: TabState, md: string): void {
    tab.baseline = md
    tab.markdown = md
    tab.dirty = false
    this.d.tabs.render()
    this.syncWindow()
  }

  private closeActive(): void {
    const tab = this.d.tabs.active()
    if (tab) this.closeTab(tab.id)
  }

  private closeTab(id: string): void {
    const tab = this.d.tabs.get(id)
    if (!tab) return
    // Capture latest edits so the dirty check reflects reality.
    if (this.d.tabs.active()?.id === id) this.stashActive()
    if (tab.dirty && !window.confirm(`「${tab.title}」尚未保存，确定关闭吗？`)) return

    const wasActive = this.d.tabs.active()?.id === id
    this.d.tabs.remove(id)

    if (this.d.tabs.list().length === 0) {
      // Always keep at least one tab open.
      this.d.tabs.add({ title: this.nextUntitledTitle(), path: null, markdown: '' })
      this.d.editor.newDocument()
      this.refreshDerived()
      this.syncWindow()
    } else if (wasActive) {
      const next = this.d.tabs.active()
      if (next) this.showTab(next)
    }
  }

  private async exportDoc(id: CommandId): Promise<void> {
    const format =
      id === Cmd.fileExportPdf
        ? 'pdf'
        : id === Cmd.fileExportWord
          ? 'word'
          : id === Cmd.fileExportImage
            ? 'image'
            : 'html'
    await window.api.export({
      format,
      html: this.d.editor.toHtml(),
      defaultName: this.baseName()
    })
  }

  // ---- helpers ----

  private ensureSidebar(panel: 'outline' | 'files'): void {
    if (!this.d.sidebar.isVisible()) {
      this.d.sidebar.toggle()
      this.d.appEl.classList.remove('sidebar-collapsed')
    }
    this.d.sidebar.show(panel)
  }

  private toggleStatusBar(): void {
    const hidden = this.d.statusbar.el.classList.toggle('hidden')
    this.d.statusbar.setVisible(!hidden)
    this.d.appEl.classList.toggle('statusbar-hidden', hidden)
  }

  private async toggleAlwaysOnTop(): Promise<void> {
    this.alwaysOnTop = await window.api.setAlwaysOnTop(!this.alwaysOnTop)
  }

  private setZoom(z: number): void {
    this.zoom = Math.min(2.5, Math.max(0.5, Math.round(z * 100) / 100))
    ;(document.body.style as unknown as { zoom: string }).zoom = String(this.zoom)
  }

  private applyTheme(id: ThemeId): void {
    this.d.theme.apply(id)
  }

  private onDocChanged(md: string): void {
    const tab = this.d.tabs.active()
    if (tab) {
      tab.markdown = md
      const nowDirty = md !== tab.baseline
      if (nowDirty !== tab.dirty) {
        tab.dirty = nowDirty
        this.d.tabs.render()
        this.syncWindow()
      }
    }
    this.refreshDerived()
  }

  private refreshDerived(): void {
    this.d.statusbar.setStats(this.d.editor.getStats())
    this.d.sidebar.setOutline(this.d.editor.getOutline())
  }

  private baseName(): string {
    const tab = this.d.tabs.active()
    if (!tab) return 'Untitled'
    if (!tab.path) return tab.title
    return baseName(tab.path).replace(/\.[^.]+$/, '')
  }

  private syncWindow(): void {
    const tab = this.d.tabs.active()
    const name = tab ? tab.title : 'Untitled'
    const dirty = tab ? tab.dirty : false
    window.api.setTitle(`${dirty ? '• ' : ''}${name} - Sky Markdown`)
    window.api.setDirty(dirty)
  }
}

/** Last path segment (works for both \\ and / separators). */
function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}
