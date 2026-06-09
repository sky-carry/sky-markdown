import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  createCodeBlockCommand
} from '@milkdown/kit/preset/commonmark'
import { gfm, toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm'
import { history, undoCommand, redoCommand } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { callCommand, replaceAll, getMarkdown } from '@milkdown/kit/utils'

import { Cmd } from '../../../shared/commands'
import type { CommandId } from '../../../shared/commands'
import type { EditorApi, EditorStats, OutlineItem } from '../types'

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
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .use(listener)
        .create()

      mounted = true
      cachedMarkdown = initial
      pendingMarkdown = null
    } catch {
      // Even if creation fails, keep the cached markdown so the rest of the
      // API stays usable (source mode, stats, outline) without throwing.
      mounted = false
      cachedMarkdown = initial
      pendingMarkdown = null
    }
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

  function focus(): void {
    if (sourceMode && textarea) {
      textarea.focus()
      return
    }
    safeAction((ctx) => {
      ctx.get(editorViewCtx).focus()
    })
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

      case Cmd.fmtBold:
        return call(toggleStrongCommand.key)
      case Cmd.fmtItalic:
        return call(toggleEmphasisCommand.key)
      case Cmd.fmtCode:
        return call(toggleInlineCodeCommand.key)
      case Cmd.fmtStrikethrough:
        return call(toggleStrikethroughCommand.key)

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

  return {
    mount,
    getMarkdown: getMarkdownText,
    setMarkdown,
    runCommand,
    onChange,
    focus,
    toggleSourceMode,
    isSourceMode,
    getOutline,
    getStats,
    scrollToHeading,
    toHtml
  }
}
