import './find.css'
import type { EditorApi } from '../types'

export interface FindBarApi {
  readonly el: HTMLElement
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
}

/**
 * Floating find & replace panel (Ctrl+H / Ctrl+F), Typora-style. Operates on the
 * live document through the editor's find/replace API. Kept deliberately small:
 * a query box, a replace box, next/prev, replace / replace-all, and a match count.
 */
export function createFindBar(host: HTMLElement, editor: EditorApi): FindBarApi {
  const panel = document.createElement('div')
  panel.className = 'findbar'
  panel.hidden = true

  panel.innerHTML = `
    <div class="fb-row">
      <input class="fb-input fb-find" type="text" placeholder="查找" />
      <span class="fb-count">0</span>
      <button class="fb-btn fb-prev" title="上一个">▲</button>
      <button class="fb-btn fb-next" title="下一个">▼</button>
      <label class="fb-case" title="区分大小写"><input type="checkbox" class="fb-case-box" />Aa</label>
      <button class="fb-btn fb-close" title="关闭 (Esc)">✕</button>
    </div>
    <div class="fb-row">
      <input class="fb-input fb-replace" type="text" placeholder="替换为" />
      <button class="fb-btn fb-do-replace" title="替换当前">替换</button>
      <button class="fb-btn fb-do-replace-all" title="全部替换">全部</button>
    </div>
  `

  host.append(panel)

  const findInput = panel.querySelector<HTMLInputElement>('.fb-find')!
  const replaceInput = panel.querySelector<HTMLInputElement>('.fb-replace')!
  const caseBox = panel.querySelector<HTMLInputElement>('.fb-case-box')!
  const countEl = panel.querySelector<HTMLSpanElement>('.fb-count')!

  function caseSensitive(): boolean {
    return caseBox.checked
  }

  function showCount(n: number): void {
    countEl.textContent = n === 0 && findInput.value ? '无结果' : String(n)
  }

  function findNext(): void {
    showCount(editor.findNext(findInput.value, caseSensitive()))
  }

  function doReplace(): void {
    const remaining = editor.replaceNext(findInput.value, replaceInput.value, caseSensitive())
    showCount(remaining)
  }

  function doReplaceAll(): void {
    const n = editor.replaceAll(findInput.value, replaceInput.value, caseSensitive())
    countEl.textContent = `已替换 ${n}`
  }

  findInput.addEventListener('input', () => showCount(editor.findNext(findInput.value, caseSensitive())))
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      findNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      doReplace()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  })

  panel.querySelector('.fb-next')!.addEventListener('click', findNext)
  panel.querySelector('.fb-prev')!.addEventListener('click', findNext)
  panel.querySelector('.fb-do-replace')!.addEventListener('click', doReplace)
  panel.querySelector('.fb-do-replace-all')!.addEventListener('click', doReplaceAll)
  panel.querySelector('.fb-close')!.addEventListener('click', () => close())

  function open(): void {
    panel.hidden = false
    findInput.focus()
    findInput.select()
    if (findInput.value) showCount(editor.findNext(findInput.value, caseSensitive()))
  }

  function close(): void {
    panel.hidden = true
    editor.focus()
  }

  function toggle(): void {
    if (panel.hidden) open()
    else close()
  }

  return {
    el: panel,
    open,
    close,
    toggle,
    isOpen: () => !panel.hidden
  }
}
