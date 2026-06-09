import './sidebar.css'
import type { OutlineItem, SidebarApi, SidebarPanel } from '../types'
import type { DirEntry } from '../../../shared/ipc'

/** File extensions that count as openable documents. */
const OPENABLE = new Set(['.md', '.markdown', '.txt'])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

function isOpenable(entry: DirEntry): boolean {
  return !entry.isDirectory && OPENABLE.has(extOf(entry.name))
}

/** Sort entries: directories first, then by case-insensitive name. */
function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
}

/**
 * Left sidebar (Typora-style). A thin tab strip switches between three panels:
 * outline (大纲), file tree (文件) and in-document search (搜索). Folders in the
 * file tree are read lazily via `window.api.readDir` on first expand.
 */
export function createSidebar(host: HTMLElement): SidebarApi {
  host.innerHTML = ''
  host.classList.remove('collapsed')

  let visible = true
  let activePanel: SidebarPanel = 'outline'
  let openFileCb: ((path: string) => void) | null = null
  let jumpHeadingCb: ((slug: string) => void) | null = null

  // ---- tab strip ----
  const tabs = document.createElement('div')
  tabs.className = 'sb-tabs'

  const tabDefs: { panel: SidebarPanel; label: string; title: string }[] = [
    { panel: 'outline', label: '大纲', title: '大纲' },
    { panel: 'files', label: '文件', title: '文件' },
    { panel: 'search', label: '搜索', title: '搜索' }
  ]

  const tabButtons = new Map<SidebarPanel, HTMLButtonElement>()

  for (const def of tabDefs) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'sb-tab'
    btn.title = def.title
    btn.textContent = def.label
    btn.addEventListener('click', () => show(def.panel))
    tabButtons.set(def.panel, btn)
    tabs.append(btn)
  }

  // ---- panel bodies ----
  const body = document.createElement('div')
  body.className = 'sb-body'

  const outlinePanel = document.createElement('div')
  outlinePanel.className = 'sb-panel sb-panel-outline'

  const filesPanel = document.createElement('div')
  filesPanel.className = 'sb-panel sb-panel-files'

  const searchPanel = document.createElement('div')
  searchPanel.className = 'sb-panel sb-panel-search'

  const searchBox = document.createElement('div')
  searchBox.className = 'sb-search-box'
  const searchInput = document.createElement('input')
  searchInput.type = 'search'
  searchInput.className = 'sb-search-input'
  searchInput.placeholder = '在文档中搜索…'
  searchBox.append(searchInput)

  const searchCount = document.createElement('div')
  searchCount.className = 'sb-search-count'

  const searchResults = document.createElement('div')
  searchResults.className = 'sb-search-results'

  searchPanel.append(searchBox, searchCount, searchResults)

  body.append(outlinePanel, filesPanel, searchPanel)
  host.append(tabs, body)

  const panels = new Map<SidebarPanel, HTMLElement>([
    ['outline', outlinePanel],
    ['files', filesPanel],
    ['search', searchPanel]
  ])

  // cache of the most recent markdown passed to search(), so typing in the
  // input box can re-run the search without main.ts re-feeding the document.
  let lastMarkdown = ''

  searchInput.addEventListener('input', () => {
    search(searchInput.value, lastMarkdown)
  })

  function show(panel: SidebarPanel): void {
    activePanel = panel
    for (const [id, el] of panels) el.classList.toggle('active', id === panel)
    for (const [id, btn] of tabButtons) btn.classList.toggle('active', id === panel)
    if (panel === 'search') searchInput.focus()
  }

  function renderEmpty(parent: HTMLElement, text: string): void {
    const empty = document.createElement('div')
    empty.className = 'sb-empty'
    empty.textContent = text
    parent.append(empty)
  }

  // ---- outline ----
  function setOutline(items: OutlineItem[]): void {
    outlinePanel.innerHTML = ''
    if (items.length === 0) {
      renderEmpty(outlinePanel, '没有标题')
      return
    }
    for (const item of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'sb-outline-item'
      btn.textContent = item.text
      btn.title = item.text
      btn.style.paddingLeft = `${10 + Math.max(0, item.level - 1) * 12}px`
      btn.addEventListener('click', () => jumpHeadingCb?.(item.slug))
      outlinePanel.append(btn)
    }
  }

  // ---- file tree ----
  function buildNode(entry: DirEntry, depth: number): HTMLElement {
    const node = document.createElement('div')
    node.className = 'sb-node'

    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'sb-node-row'
    row.title = entry.name
    row.style.paddingLeft = `${10 + depth * 12}px`

    const twisty = document.createElement('span')
    twisty.className = 'sb-node-twisty'
    twisty.textContent = entry.isDirectory ? '▶' : ''

    const icon = document.createElement('span')
    icon.className = 'sb-node-icon'
    icon.textContent = entry.isDirectory ? '📁' : '📄'

    const label = document.createElement('span')
    label.className = 'sb-node-label'
    label.textContent = entry.name

    row.append(twisty, icon, label)
    node.append(row)

    if (entry.isDirectory) {
      const children = document.createElement('div')
      children.className = 'sb-children'
      children.style.display = 'none'
      node.append(children)

      let expanded = false
      let loaded = false

      row.addEventListener('click', async () => {
        expanded = !expanded
        children.style.display = expanded ? 'flex' : 'none'
        twisty.textContent = expanded ? '▼' : '▶'
        icon.textContent = expanded ? '📂' : '📁'
        if (expanded && !loaded) {
          loaded = true
          await renderTreeInto(children, entry.path, depth + 1)
        }
      })
    } else {
      row.addEventListener('click', () => {
        if (isOpenable(entry)) openFileCb?.(entry.path)
      })
      if (!isOpenable(entry)) row.classList.add('sb-node-disabled')
    }

    return node
  }

  async function renderTreeInto(parent: HTMLElement, path: string, depth: number): Promise<void> {
    let entries: DirEntry[] = []
    try {
      entries = await window.api.readDir(path)
    } catch {
      entries = []
    }
    parent.innerHTML = ''
    if (entries.length === 0) {
      renderEmpty(parent, '（空）')
      return
    }
    for (const entry of sortEntries(entries)) {
      parent.append(buildNode(entry, depth))
    }
  }

  async function setFolder(path: string): Promise<void> {
    filesPanel.innerHTML = ''
    const tree = document.createElement('div')
    tree.className = 'sb-tree'
    filesPanel.append(tree)
    show('files')
    await renderTreeInto(tree, path, 0)
  }

  // ---- search ----
  function search(query: string, markdown: string): void {
    lastMarkdown = markdown
    if (searchInput.value !== query) searchInput.value = query

    searchResults.innerHTML = ''
    const q = query.trim()
    if (q === '') {
      searchCount.textContent = ''
      return
    }

    const needle = q.toLowerCase()
    const lines = markdown.split('\n')
    let matches = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const idx = line.toLowerCase().indexOf(needle)
      if (idx < 0) continue
      matches++

      const result = document.createElement('div')
      result.className = 'sb-search-result'
      result.title = `第 ${i + 1} 行`

      let from = 0
      let hit = line.toLowerCase().indexOf(needle, from)
      while (hit >= 0) {
        if (hit > from) result.append(document.createTextNode(line.slice(from, hit)))
        const mark = document.createElement('mark')
        mark.textContent = line.slice(hit, hit + q.length)
        result.append(mark)
        from = hit + q.length
        hit = line.toLowerCase().indexOf(needle, from)
      }
      if (from < line.length) result.append(document.createTextNode(line.slice(from)))

      searchResults.append(result)
    }

    searchCount.textContent = matches === 0 ? '无结果' : `${matches} 个匹配行`
  }

  // initial state
  show(activePanel)

  return {
    el: host,

    toggle(): boolean {
      visible = !visible
      host.classList.toggle('collapsed', !visible)
      return visible
    },

    show,

    isVisible(): boolean {
      return visible
    },

    setOutline,

    setFolder,

    onOpenFile(cb: (path: string) => void): void {
      openFileCb = cb
    },

    onJumpHeading(cb: (slug: string) => void): void {
      jumpHeadingCb = cb
    },

    search
  }
}
