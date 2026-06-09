import { Cmd } from '../../../shared/commands'
import type { CommandId, ThemeId } from '../../../shared/commands'
import type { EditorApi, SidebarApi, StatusBarApi, ThemeApi } from '../types'

interface Deps {
  editor: EditorApi
  sidebar: SidebarApi
  statusbar: StatusBarApi
  theme: ThemeApi
  appEl: HTMLElement
}

/**
 * Routes every menu command to the right subsystem and owns the open document's
 * lifecycle (current path + dirty flag). It is intentionally the only place that
 * knows how the modules fit together.
 */
export class Dispatcher {
  private currentPath: string | null = null
  private dirty = false
  private zoom = 1

  constructor(private d: Deps) {}

  init(): void {
    this.d.editor.onChange(() => this.onDocChanged())
    this.d.sidebar.onOpenFile((p) => this.openPath(p))
    this.d.sidebar.onJumpHeading((slug) => this.d.editor.scrollToHeading(slug))
    this.d.statusbar.onToggleSidebar(() => this.run(Cmd.viewToggleSidebar))
    this.d.statusbar.onToggleSource(() => this.run(Cmd.viewSourceMode))
    this.refreshDerived()
    this.updateTitle()
  }

  /** Entry point for menu commands. */
  run(id: CommandId, arg?: string): void {
    // 1) Let the editor claim editor/format/paragraph/edit commands first.
    if (this.d.editor.runCommand(id, arg)) {
      this.onDocChanged()
      return
    }
    // 2) Otherwise route by domain.
    switch (id) {
      case Cmd.fileNew:
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
      case Cmd.fileExportHtml:
      case Cmd.fileExportPdf:
      case Cmd.fileExportWord:
      case Cmd.fileExportImage:
        this.exportDoc(id)
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
        this.ensureSidebar('files')
        break
      case Cmd.viewSearch:
        this.ensureSidebar('search')
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

  // ---- document lifecycle ----

  private async newDoc(): Promise<void> {
    if (!(await this.confirmDiscard())) return
    this.d.editor.setMarkdown('')
    this.currentPath = null
    this.setDirty(false)
    this.refreshDerived()
    this.updateTitle()
    this.d.editor.focus()
  }

  private async openDialog(): Promise<void> {
    if (!(await this.confirmDiscard())) return
    const res = await window.api.openFile()
    if (res) this.loadFile(res.path, res.content)
  }

  private async openPath(path: string): Promise<void> {
    if (!(await this.confirmDiscard())) return
    const res = await window.api.readFile(path)
    if (res) this.loadFile(res.path, res.content)
  }

  private loadFile(path: string, content: string): void {
    this.d.editor.setMarkdown(content)
    this.currentPath = path
    this.setDirty(false)
    window.api.addRecent(path)
    this.refreshDerived()
    this.updateTitle()
  }

  private async openFolder(): Promise<void> {
    const folder = await window.api.openFolder()
    if (folder) {
      await this.d.sidebar.setFolder(folder)
      this.ensureSidebar('files')
    }
  }

  private async save(forceDialog: boolean): Promise<void> {
    const md = this.d.editor.getMarkdown()
    if (this.currentPath && !forceDialog) {
      const ok = await window.api.writeFile(this.currentPath, md)
      if (ok) this.setDirty(false)
      return
    }
    const newPath = await window.api.saveFile(this.currentPath, md)
    if (newPath) {
      this.currentPath = newPath
      window.api.addRecent(newPath)
      this.setDirty(false)
      this.updateTitle()
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

  private ensureSidebar(panel: 'outline' | 'files' | 'search'): void {
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

  private setZoom(z: number): void {
    this.zoom = Math.min(2.5, Math.max(0.5, Math.round(z * 100) / 100))
    ;(document.body.style as unknown as { zoom: string }).zoom = String(this.zoom)
  }

  private applyTheme(id: ThemeId): void {
    this.d.theme.apply(id)
  }

  private onDocChanged(): void {
    if (!this.dirty) this.setDirty(true)
    this.refreshDerived()
  }

  private refreshDerived(): void {
    this.d.statusbar.setStats(this.d.editor.getStats())
    this.d.sidebar.setOutline(this.d.editor.getOutline())
  }

  private setDirty(dirty: boolean): void {
    this.dirty = dirty
    window.api.setDirty(dirty)
    this.updateTitle()
  }

  private baseName(): string {
    if (!this.currentPath) return 'Untitled'
    const parts = this.currentPath.split(/[\\/]/)
    return parts[parts.length - 1].replace(/\.[^.]+$/, '')
  }

  private updateTitle(): void {
    const name = this.currentPath ? this.baseName() : 'Untitled'
    const title = `${this.dirty ? '• ' : ''}${name} - Sky Markdown`
    window.api.setTitle(title)
  }

  private async confirmDiscard(): Promise<boolean> {
    if (!this.dirty) return true
    return window.confirm('当前文档尚未保存，确定要放弃更改吗？')
  }
}
