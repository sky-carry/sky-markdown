import './statusbar.css'
import type { EditorStats, StatusBarApi } from '../types'

/**
 * Bottom status bar (Typora-style). Left group: sidebar toggle (○) + source-code
 * "</>" toggle. Right group: spell-check toggle (A✓) + word count, where clicking
 * the count opens a detailed statistics popover.
 */
export function createStatusBar(host: HTMLElement): StatusBarApi {
  host.innerHTML = ''

  let spellOn = false
  let lastStats: EditorStats = { words: 0, chars: 0, lines: 0, readMinutes: 0 }
  let spellCb: ((on: boolean) => void) | null = null

  // ---- left group ----
  const left = document.createElement('div')
  left.className = 'sb-group sb-left'

  const sidebarBtn = document.createElement('button')
  sidebarBtn.type = 'button'
  sidebarBtn.className = 'sb-btn sb-toggle-sidebar'
  sidebarBtn.title = '显示 / 隐藏侧边栏'
  sidebarBtn.textContent = '○'

  const sourceBtn = document.createElement('button')
  sourceBtn.type = 'button'
  sourceBtn.className = 'sb-btn sb-toggle-source'
  sourceBtn.title = '启用源代码模式'
  sourceBtn.textContent = '</>'

  left.append(sidebarBtn, sourceBtn)

  // ---- right group ----
  const right = document.createElement('div')
  right.className = 'sb-group sb-right'

  const spellBtn = document.createElement('button')
  spellBtn.type = 'button'
  spellBtn.className = 'sb-btn sb-spell'
  spellBtn.title = '拼写检查（关闭）'
  spellBtn.textContent = 'A✓'

  // word count button + popover
  const wordWrap = document.createElement('div')
  wordWrap.className = 'sb-words-wrap'

  const wordsBtn = document.createElement('button')
  wordsBtn.type = 'button'
  wordsBtn.className = 'sb-btn sb-words'
  wordsBtn.title = '字数统计'

  const wordsLabel = document.createElement('span')
  wordsLabel.className = 'sb-words-label'
  wordsLabel.textContent = '0 词'
  const wordsChevron = document.createElement('span')
  wordsChevron.className = 'sb-words-chevron'
  wordsChevron.textContent = '⌃'
  wordsBtn.append(wordsLabel, wordsChevron)

  const popover = document.createElement('div')
  popover.className = 'sb-wordcount-popover'
  popover.hidden = true

  wordWrap.append(wordsBtn, popover)
  right.append(spellBtn, wordWrap)

  host.append(left, right)

  function renderPopover(): void {
    const { words, chars, lines, readMinutes } = lastStats
    const rows: [string, string][] = [
      ['字数', `${words}`],
      ['字符数', `${chars}`],
      ['行数', `${lines}`],
      ['预计阅读', `${readMinutes} 分钟`]
    ]
    popover.innerHTML = ''
    const title = document.createElement('div')
    title.className = 'sb-wc-title'
    title.textContent = '字数统计'
    popover.append(title)
    for (const [k, v] of rows) {
      const row = document.createElement('div')
      row.className = 'sb-wc-row'
      const key = document.createElement('span')
      key.textContent = k
      const val = document.createElement('span')
      val.className = 'sb-wc-val'
      val.textContent = v
      row.append(key, val)
      popover.append(row)
    }
  }

  function setPopoverOpen(open: boolean): void {
    if (open) renderPopover()
    popover.hidden = !open
    wordsBtn.classList.toggle('active', open)
  }

  wordsBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    setPopoverOpen(popover.hidden)
  })

  // click outside closes the popover
  document.addEventListener('click', (e) => {
    if (!popover.hidden && !wordWrap.contains(e.target as Node)) setPopoverOpen(false)
  })

  spellBtn.addEventListener('click', () => {
    spellOn = !spellOn
    spellBtn.classList.toggle('active', spellOn)
    spellBtn.title = spellOn ? '拼写检查（开启）' : '拼写检查（关闭）'
    spellCb?.(spellOn)
  })

  return {
    el: host,

    setStats(stats: EditorStats): void {
      lastStats = stats
      wordsLabel.textContent = `${stats.words} 词`
      if (!popover.hidden) renderPopover()
    },

    setSourceMode(on: boolean): void {
      sourceBtn.classList.toggle('active', on)
      sourceBtn.title = on ? '关闭源代码模式' : '启用源代码模式'
    },

    setSpellCheck(on: boolean): void {
      spellOn = on
      spellBtn.classList.toggle('active', on)
      spellBtn.title = on ? '拼写检查（开启）' : '拼写检查（关闭）'
    },

    setVisible(visible: boolean): void {
      host.classList.toggle('hidden', !visible)
    },

    onToggleSidebar(cb: () => void): void {
      sidebarBtn.addEventListener('click', () => cb())
    },

    onToggleSource(cb: () => void): void {
      sourceBtn.addEventListener('click', () => cb())
    },

    onToggleSpellCheck(cb: (on: boolean) => void): void {
      spellCb = cb
    },

    toggleWordCount(): void {
      setPopoverOpen(popover.hidden)
    }
  }
}
