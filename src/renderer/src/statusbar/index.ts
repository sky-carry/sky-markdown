import './statusbar.css'
import type { EditorStats, StatusBarApi } from '../types'

/**
 * Bottom status bar (Typora-style). Left group holds the sidebar toggle (round
 * ⊙ glyph) and the source-code "</>" toggle; right group shows a spell-check
 * indicator and the live word count.
 */
export function createStatusBar(host: HTMLElement): StatusBarApi {
  host.innerHTML = ''

  const left = document.createElement('div')
  left.className = 'sb-group sb-left'

  const sidebarBtn = document.createElement('button')
  sidebarBtn.type = 'button'
  sidebarBtn.className = 'sb-btn sb-toggle-sidebar'
  sidebarBtn.title = '显示 / 隐藏侧边栏'
  sidebarBtn.textContent = '◉'

  const sourceBtn = document.createElement('button')
  sourceBtn.type = 'button'
  sourceBtn.className = 'sb-btn sb-toggle-source'
  sourceBtn.title = '启用源代码模式'
  sourceBtn.textContent = '</>'

  left.append(sidebarBtn, sourceBtn)

  const right = document.createElement('div')
  right.className = 'sb-group sb-right'

  const spell = document.createElement('span')
  spell.className = 'sb-spell'
  spell.title = '拼写检查'
  spell.textContent = 'A✓'

  const words = document.createElement('span')
  words.className = 'sb-words'
  words.title = '字数统计'
  words.textContent = '0 词'

  right.append(spell, words)

  host.append(left, right)

  return {
    el: host,

    setStats(stats: EditorStats): void {
      words.textContent = `${stats.words} 词`
      words.title = `字数统计 · ${stats.chars} 字符 · ${stats.lines} 行`
    },

    setSourceMode(on: boolean): void {
      sourceBtn.classList.toggle('active', on)
      sourceBtn.title = on ? '关闭源代码模式' : '启用源代码模式'
    },

    setVisible(visible: boolean): void {
      host.classList.toggle('hidden', !visible)
    },

    onToggleSidebar(cb: () => void): void {
      sidebarBtn.addEventListener('click', () => cb())
    },

    onToggleSource(cb: () => void): void {
      sourceBtn.addEventListener('click', () => cb())
    }
  }
}
