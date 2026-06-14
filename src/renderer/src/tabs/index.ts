import './tabs.css'
import type { TabBarApi, TabState } from '../types'

/**
 * Top tab strip — each open document is a tab inside the same window (txt-editor
 * style), instead of replacing the current document or opening a new window.
 *
 * This module is a thin view + data store: it owns the tab list and the active id
 * and renders the pills, but it never touches the editor. The dispatcher listens
 * to the intent callbacks (select / close / new) and performs the actual content
 * swap, so there is a single place that knows how a tab maps to editor content.
 */
export function createTabBar(host: HTMLElement): TabBarApi {
  host.innerHTML = ''
  host.classList.add('tabbar')

  const strip = document.createElement('div')
  strip.className = 'tab-strip'

  const newBtn = document.createElement('button')
  newBtn.type = 'button'
  newBtn.className = 'tab-new'
  newBtn.title = '新建标签页 (Ctrl+N)'
  newBtn.textContent = '+'

  host.append(strip, newBtn)

  const tabs: TabState[] = []
  let activeId: string | null = null
  let seq = 0

  let selectCb: ((id: string) => void) | null = null
  let closeCb: ((id: string) => void) | null = null
  let newCb: (() => void) | null = null

  newBtn.addEventListener('click', () => newCb?.())

  function nextId(): string {
    seq += 1
    return `tab-${seq}`
  }

  function get(id: string): TabState | undefined {
    return tabs.find((t) => t.id === id)
  }

  function active(): TabState | undefined {
    return activeId ? get(activeId) : undefined
  }

  function render(): void {
    strip.innerHTML = ''
    for (const tab of tabs) {
      const pill = document.createElement('div')
      pill.className = 'tab-pill'
      pill.classList.toggle('active', tab.id === activeId)
      pill.title = tab.path ?? tab.title

      const dot = document.createElement('span')
      dot.className = 'tab-dot'
      dot.classList.toggle('visible', tab.dirty)
      dot.textContent = '●'

      const label = document.createElement('span')
      label.className = 'tab-label'
      label.textContent = tab.title

      const close = document.createElement('button')
      close.type = 'button'
      close.className = 'tab-close'
      close.title = '关闭'
      close.textContent = '✕'
      close.addEventListener('click', (e) => {
        e.stopPropagation()
        closeCb?.(tab.id)
      })

      pill.addEventListener('mousedown', (e) => {
        // middle-click closes, like a browser tab
        if (e.button === 1) {
          e.preventDefault()
          closeCb?.(tab.id)
        }
      })
      pill.addEventListener('click', () => selectCb?.(tab.id))

      pill.append(dot, label, close)
      strip.append(pill)
    }
    // The strip is only useful with at least one tab; hide chrome when empty.
    host.classList.toggle('empty', tabs.length === 0)
  }

  function add(init: { title: string; path?: string | null; markdown?: string }): TabState {
    const md = init.markdown ?? ''
    const tab: TabState = {
      id: nextId(),
      title: init.title,
      path: init.path ?? null,
      markdown: md,
      baseline: md,
      dirty: false
    }
    tabs.push(tab)
    activeId = tab.id
    render()
    return tab
  }

  function setActive(id: string): void {
    if (!get(id)) return
    activeId = id
    render()
  }

  function remove(id: string): void {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    const wasActive = activeId === id
    tabs.splice(idx, 1)
    if (wasActive) {
      const neighbour = tabs[idx] ?? tabs[idx - 1] ?? null
      activeId = neighbour ? neighbour.id : null
    }
    render()
  }

  function findByPath(path: string): TabState | undefined {
    return tabs.find((t) => t.path === path)
  }

  function update(id: string, patch: Partial<TabState>): void {
    const tab = get(id)
    if (!tab) return
    Object.assign(tab, patch)
    render()
  }

  render()

  return {
    el: host,
    add,
    get,
    active,
    list: () => [...tabs],
    setActive,
    remove,
    findByPath,
    update,
    render,
    onSelect(cb): void {
      selectCb = cb
    },
    onCloseIntent(cb): void {
      closeCb = cb
    },
    onNew(cb): void {
      newCb = cb
    }
  }
}
