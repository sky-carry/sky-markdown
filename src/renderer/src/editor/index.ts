import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  insertImageCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  sinkListItemCommand,
  liftListItemCommand,
  insertHrCommand,
  createCodeBlockCommand
} from '@milkdown/kit/preset/commonmark'
import { gfm, toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm'
import { history, undoCommand, redoCommand } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
// gap-cursor (reach the gap before the first / after the last block) + drop-cursor
import { cursor } from '@milkdown/kit/plugin/cursor'
// keep an empty trailing paragraph so the caret can always go past the last block
import { trailing } from '@milkdown/kit/plugin/trailing'
import { callCommand, replaceAll, getMarkdown } from '@milkdown/kit/utils'
import { Selection, AllSelection, TextSelection } from '@milkdown/kit/prose/state'

import { Cmd } from '../../../shared/commands'
import type { CommandId } from '../../../shared/commands'
import type { EditorApi, EditorStats, OutlineItem } from '../types'

import { listExitKeymap } from './list-exit'
// makes the gap-cursor (a blinking caret in the gap before/after a block) visible
import '@milkdown/kit/prose/gapcursor/style/gapcursor.css'
import './editor.css'

/**
 * Build a github-style slug from heading text:
 * lowercase, spaces -> '-', strip punctuation, keep CJK / alphanumerics.
 */
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    // keep word chars, CJK ranges and hyphens; drop everything else
    .replace(
      /[^\w一-鿿぀-ヿ가-힯-]+/g,
      ''
    )
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Iterate cached markdown lines skipping fenced code blocks. */
function* contentLines(md: string): Generator<string> {
  let inFence = false
  let fence = ''
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\s*(```+|~~~+)/)
    if (m) {
      if (!inFence) {
        inFence = true
        fence = m[1][0]
      } else if (m[1][0] === fence) {
        inFence = false
        fence = ''
      }
      continue
    }
    if (inFence) continue
    yield line
  }
}

export function createEditor(): EditorApi {
  let editor: Editor | null = null
  let mounted = false
  let container: HTMLElement | null = null
  let textarea: HTMLTextAreaElement | null = null
  let sourceMode = false
  let spellCheckOn = false

  let cachedMarkdown = ''
  let pendingMarkdown: string | null = null
  const changeCallbacks: Array<(md: string) => void> = []

  function emitChange(md: string): void {
    for (const cb of changeCallbacks) {
      try {
        cb(md)
      } catch {
        /* a misbehaving listener must not break the editor */
      }
    }
  }

  function safeAction<T>(fn: (ctx: Ctx) => T): T | undefined {
    if (!editor || !mounted) return undefined
    try {
      return editor.action(fn)
    } catch {
      return undefined
    }
  }

  async function mount(host: HTMLElement): Promise<void> {
    container = host
    container.classList.add('sky-editor-host')

    // Source-mode overlay textarea lives inside the mount container.
    textarea = document.createElement('textarea')
    textarea.className = 'sky-source-textarea'
    textarea.spellcheck = false
    container.appendChild(textarea)

    const initial = pendingMarkdown ?? cachedMarkdown

    try {
      editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, container as HTMLElement)
          ctx.set(defaultValueCtx, initial)
          const lc = ctx.get(listenerCtx)
          lc.markdownUpdated((_ctx, markdown) => {
            cachedMarkdown = markdown
            emitChange(markdown)
          })
        })
        // registered first so its Enter/Backspace handlers win over commonmark's
        .use(listExitKeymap)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .use(cursor)
        .use(trailing)
        .use(listener)
        .create()

      mounted = true
      cachedMarkdown = initial
      pendingMarkdown = null
      setSpellCheck(spellCheckOn) // apply initial state (default: off)
    } catch (err) {
      // Even if creation fails, keep the cached markdown so the rest of the
      // API stays usable (source mode, stats, outline) without throwing.
      console.error('[editor] Milkdown failed to mount:', err)
      mounted = false
      cachedMarkdown = initial
      pendingMarkdown = null
    }
  }

  // ---- custom editing operations (no ready-made Milkdown command) ----

  /** Select the whole document. */
  function selectAllText(): void {
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)))
      view.focus()
    })
  }

  /** Strip every inline mark (bold/italic/code/link…) from the selection. */
  function clearMarks(): void {
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { from, to, empty } = view.state.selection
      if (empty) return
      view.dispatch(view.state.tr.removeMark(from, to, null))
    })
  }

  /** Select the text of the current paragraph / block (Edit → 选中行). */
  function selectCurrentLine(): void {
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { $from } = view.state.selection
      const start = $from.start()
      const end = $from.end()
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, end)))
      view.focus()
    })
  }

  /** Delete the current top-level block (Edit → 删除该行). */
  function deleteCurrentLine(): void {
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state } = view
      const { $from } = state.selection
      // Range covering the whole top-level block the caret sits in.
      const before = $from.before(1)
      const after = $from.after(1)
      view.dispatch(state.tr.delete(before, after).scrollIntoView())
      view.focus()
    })
  }

  /** Move the current top-level block up or down among its siblings. */
  function moveCurrentBlock(dir: -1 | 1): void {
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { state } = view
      const { $from } = state.selection
      const index = $from.index(0)
      const parent = $from.node(0)
      const target = index + dir
      if (target < 0 || target >= parent.childCount) return
      const block = parent.child(index)
      const start = $from.before(1)
      const end = $from.after(1)
      let tr = state.tr.delete(start, end)
      // Insert position for the neighbour: when moving down, account for the
      // gap left by the deletion.
      let insertPos: number
      if (dir < 0) {
        insertPos = start - parent.child(target).nodeSize
      } else {
        insertPos = start + parent.child(target).nodeSize
      }
      tr = tr.insert(insertPos, block)
      const caret = Selection.near(tr.doc.resolve(Math.min(insertPos + 1, tr.doc.content.size)))
      tr = tr.setSelection(caret).scrollIntoView()
      view.dispatch(tr)
      view.focus()
    })
  }

  /** Toggle the current bullet-list item between a plain item and a task item. */
  function toggleTaskList(): void {
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      // Make sure we're inside a list first.
      let inList = false
      const { $from } = view.state.selection
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'list_item') {
          inList = true
          break
        }
      }
      if (!inList) callCommand(wrapInBulletListCommand.key)(ctx)

      const state = view.state
      const $pos = state.selection.$from
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d)
        if (node.type.name === 'list_item') {
          const pos = $pos.before(d)
          const checked = node.attrs.checked
          const next = checked === null || checked === undefined ? false : null
          view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: next }))
          break
        }
      }
      view.focus()
    })
  }

  /** Insert / toggle a hyperlink on the selection (prompts for the URL). */
  function insertHyperlink(): void {
    const url = window.prompt('请输入链接地址 (URL)：', 'https://')
    if (!url) return
    try {
      safeAction(callCommand(toggleLinkCommand.key, { href: url }))
    } catch {
      /* ignore */
    }
  }

  /** Insert an image at the caret (prompts for the URL). */
  function insertImage(): void {
    const src = window.prompt('请输入图片地址 (URL)：', 'https://')
    if (!src) return
    try {
      safeAction(callCommand(insertImageCommand.key, { src }))
    } catch {
      /* ignore */
    }
  }

  // ---- find & replace (operates over the live ProseMirror document) ----

  /** Collect every match range of `query` across the document's text nodes. */
  function findRanges(query: string, caseSensitive: boolean): Array<{ from: number; to: number }> {
    const ranges: Array<{ from: number; to: number }> = []
    if (!query) return ranges
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const needle = caseSensitive ? query : query.toLowerCase()
      view.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return
        const hay = caseSensitive ? node.text : node.text.toLowerCase()
        let i = hay.indexOf(needle)
        while (i !== -1) {
          ranges.push({ from: pos + i, to: pos + i + query.length })
          i = hay.indexOf(needle, i + Math.max(1, query.length))
        }
      })
    })
    return ranges
  }

  /** Select the next match after the caret (wraps around). Returns match count. */
  function findNext(query: string, caseSensitive = false): number {
    let count = 0
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const ranges = findRanges(query, caseSensitive)
      count = ranges.length
      if (count === 0) return
      const cursor = view.state.selection.to
      const next = ranges.find((r) => r.from >= cursor) ?? ranges[0]
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, next.from, next.to))
          .scrollIntoView()
      )
      view.focus()
    })
    return count
  }

  /** If the current selection is a match, replace it, then advance. Returns remaining count. */
  function replaceNext(query: string, replacement: string, caseSensitive = false): number {
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const { from, to } = view.state.selection
      const selected = view.state.doc.textBetween(from, to)
      const matches = caseSensitive
        ? selected === query
        : selected.toLowerCase() === query.toLowerCase()
      if (matches && selected.length > 0) {
        view.dispatch(view.state.tr.insertText(replacement, from, to))
      }
    })
    return findNext(query, caseSensitive)
  }

  /** Replace every match in the document. Returns the number replaced. */
  function replaceAllText(query: string, replacement: string, caseSensitive = false): number {
    let replaced = 0
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const ranges = findRanges(query, caseSensitive)
      if (ranges.length === 0) return
      let tr = view.state.tr
      // Apply right-to-left so earlier positions stay valid.
      for (let i = ranges.length - 1; i >= 0; i--) {
        tr = tr.insertText(replacement, ranges[i].from, ranges[i].to)
      }
      view.dispatch(tr)
      replaced = ranges.length
    })
    return replaced
  }

  function getMarkdownText(): string {
    if (sourceMode && textarea) return textarea.value
    const live = safeAction(getMarkdown())
    if (typeof live === 'string') {
      cachedMarkdown = live
      return live
    }
    return cachedMarkdown
  }

  function setMarkdown(md: string): void {
    cachedMarkdown = md
    if (sourceMode && textarea) {
      textarea.value = md
    }
    if (!mounted || !editor) {
      pendingMarkdown = md
      return
    }
    try {
      editor.action(replaceAll(md))
    } catch {
      pendingMarkdown = md
    }
  }

  function onChange(cb: (md: string) => void): void {
    changeCallbacks.push(cb)
  }

  function focus(atEnd = false): void {
    if (sourceMode && textarea) {
      textarea.focus()
      return
    }
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      // After replaceAll (e.g. File→New) the document is rebuilt and the leftover
      // selection can land on a position that renders no visible caret (most
      // notably on a fresh empty document). Place a real text selection inside
      // the document — atStart/atEnd resolve into the first/last text block — so a
      // blinking caret always appears, then move focus into the editable surface.
      const doc = view.state.doc
      const sel = atEnd ? Selection.atEnd(doc) : Selection.atStart(doc)
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
      view.focus()
    })
  }

  /** Reset to a blank document and drop a visible caret in (used by File→New / new tab). */
  function newDocument(): void {
    setMarkdown('')
    // The view was just rebuilt by replaceAll(''); let it settle one frame, then
    // place the caret at the start of the empty paragraph.
    requestAnimationFrame(() => focus(false))
  }

  function runCommand(id: CommandId, arg?: string): boolean {
    const call = (command: Parameters<typeof callCommand>[0], payload?: unknown): boolean => {
      try {
        safeAction(callCommand(command, payload))
      } catch {
        /* a wrong command name must never break the editor */
      }
      return true
    }

    switch (id) {
      case Cmd.editUndo:
        return call(undoCommand.key)
      case Cmd.editRedo:
        return call(redoCommand.key)
      case Cmd.editSelectAll:
        selectAllText()
        return true
      case Cmd.editSelectLine:
        selectCurrentLine()
        return true
      case Cmd.editDeleteLine:
        deleteCurrentLine()
        return true
      case Cmd.editMoveLineUp:
        moveCurrentBlock(-1)
        return true
      case Cmd.editMoveLineDown:
        moveCurrentBlock(1)
        return true

      case Cmd.fmtBold:
        return call(toggleStrongCommand.key)
      case Cmd.fmtItalic:
        return call(toggleEmphasisCommand.key)
      case Cmd.fmtCode:
        return call(toggleInlineCodeCommand.key)
      case Cmd.fmtStrikethrough:
        return call(toggleStrikethroughCommand.key)
      case Cmd.fmtHyperlink:
        insertHyperlink()
        return true
      case Cmd.fmtImage:
        insertImage()
        return true
      case Cmd.fmtClearStyle:
        clearMarks()
        return true

      case Cmd.paraHeading1:
        return call(wrapInHeadingCommand.key, 1)
      case Cmd.paraHeading2:
        return call(wrapInHeadingCommand.key, 2)
      case Cmd.paraHeading3:
        return call(wrapInHeadingCommand.key, 3)
      case Cmd.paraHeading4:
        return call(wrapInHeadingCommand.key, 4)
      case Cmd.paraHeading5:
        return call(wrapInHeadingCommand.key, 5)
      case Cmd.paraHeading6:
        return call(wrapInHeadingCommand.key, 6)
      case Cmd.paraParagraph:
        return call(turnIntoTextCommand.key)
      case Cmd.paraUnorderedList:
        return call(wrapInBulletListCommand.key)
      case Cmd.paraOrderedList:
        return call(wrapInOrderedListCommand.key)
      case Cmd.paraTaskList:
        toggleTaskList()
        return true
      case Cmd.paraIndent:
        return call(sinkListItemCommand.key)
      case Cmd.paraOutdent:
        return call(liftListItemCommand.key)
      case Cmd.paraQuote:
        return call(wrapInBlockquoteCommand.key)
      case Cmd.paraCodeBlock:
        return call(createCodeBlockCommand.key, arg)
      case Cmd.paraHorizontalRule:
        return call(insertHrCommand.key)
      case Cmd.paraTable:
        return call(insertTableCommand.key)

      default:
        // Not an id this editor owns — let the dispatcher route it elsewhere.
        return false
    }
  }

  function toggleSourceMode(): boolean {
    if (!container || !textarea) {
      sourceMode = !sourceMode
      return sourceMode
    }
    if (!sourceMode) {
      // turning ON
      textarea.value = getMarkdownText()
      sourceMode = true
      container.classList.add('source-mode')
      textarea.focus()
    } else {
      // turning OFF
      const value = textarea.value
      sourceMode = false
      container.classList.remove('source-mode')
      setMarkdown(value)
      focus()
    }
    return sourceMode
  }

  function isSourceMode(): boolean {
    return sourceMode
  }

  function getOutline(): OutlineItem[] {
    const md = getMarkdownText()
    const items: OutlineItem[] = []
    for (const line of contentLines(md)) {
      const m = line.match(/^(#{1,6})\s+(.*)$/)
      if (!m) continue
      const text = m[2].trim()
      if (!text) continue
      items.push({ level: m[1].length, text, slug: slugify(text) })
    }
    return items
  }

  function scrollToHeading(slug: string): void {
    if (sourceMode) return
    safeAction((ctx) => {
      const view = ctx.get(editorViewCtx)
      const headings = view.dom.querySelectorAll('h1, h2, h3, h4, h5, h6')
      for (const h of Array.from(headings)) {
        if (slugify(h.textContent ?? '') === slug) {
          h.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }
    })
  }

  function getStats(): EditorStats {
    const md = getMarkdownText()
    const chars = md.length
    const lines = md.length === 0 ? 0 : md.split(/\r?\n/).length

    // CJK characters count individually; latin word groups count as one word.
    const cjk = md.match(/[一-鿿぀-ヿ가-힯]/g)?.length ?? 0
    const latin = md.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
    const words = cjk + latin

    const readMinutes = Math.max(1, Math.round(words / 250))
    return { words, chars, lines, readMinutes }
  }

  function toHtml(): string {
    const html = safeAction((ctx) => ctx.get(editorViewCtx).dom.innerHTML)
    return typeof html === 'string' ? html : ''
  }

  function setSpellCheck(on: boolean): void {
    spellCheckOn = on
    safeAction((ctx) => {
      const dom = ctx.get(editorViewCtx).dom as HTMLElement
      dom.spellcheck = on
      dom.setAttribute('spellcheck', String(on))
    })
    if (textarea) textarea.spellcheck = on
  }

  return {
    mount,
    getMarkdown: getMarkdownText,
    setMarkdown,
    newDocument,
    runCommand,
    onChange,
    focus,
    toggleSourceMode,
    isSourceMode,
    getOutline,
    getStats,
    scrollToHeading,
    setSpellCheck,
    findNext,
    replaceNext,
    replaceAll: replaceAllText,
    toHtml
  }
}
