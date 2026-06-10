import { $prose } from '@milkdown/kit/utils'
import { keymap } from '@milkdown/kit/prose/keymap'
import { liftListItem } from '@milkdown/kit/prose/schema-list'
import type { Command, EditorState } from '@milkdown/kit/prose/state'

/**
 * "Escape the list" behaviour, like Typora: when the caret sits in an EMPTY list
 * item, pressing Enter or Backspace lifts that item out of the list (turning it
 * into a normal paragraph, or de-nesting one level for nested lists) instead of
 * merging back into the item above — so you can never get permanently trapped
 * inside a list.
 *
 * For any non-empty item the handlers return false, delegating to Milkdown's
 * default Enter (split item) / Backspace (join) behaviour.
 */
function inEmptyListItem(state: EditorState): boolean {
  const sel = state.selection
  if (!sel.empty) return false
  const { $from } = sel
  // the current textblock (paragraph) must be empty
  if ($from.parent.content.size !== 0) return false
  const listItemType = state.schema.nodes.list_item
  if (!listItemType) return false
  // the paragraph's parent must be a list item
  const parent = $from.node(-1)
  return parent != null && parent.type === listItemType
}

const exitList: Command = (state, dispatch) => {
  if (!inEmptyListItem(state)) return false
  const listItemType = state.schema.nodes.list_item
  return liftListItem(listItemType)(state, dispatch)
}

/** Registered before the commonmark preset so it claims Enter/Backspace first. */
export const listExitKeymap = $prose(() =>
  keymap({
    Enter: exitList,
    Backspace: exitList
  })
)
