import type { ThemeApi } from '../types'
import type { ThemeId } from '../../../shared/commands'
import { ThemeIds } from '../../../shared/commands'

// Import all theme stylesheets so the bundler includes them in the build.
import '../themes/github.css'
import '../themes/newsprint.css'
import '../themes/night.css'
import '../themes/pixyll.css'
import '../themes/whitey.css'

const STORAGE_KEY = 'sky-theme'
const DEFAULT_THEME: ThemeId = 'github'

function isThemeId(value: string | null): value is ThemeId {
  return value != null && (ThemeIds as readonly string[]).includes(value)
}

/** Create the theme manager. Applies the persisted (or default) theme on load. */
export function createTheme(appEl: HTMLElement): ThemeApi {
  let active: ThemeId = DEFAULT_THEME

  const apply = (id: ThemeId): void => {
    active = id
    document.documentElement.setAttribute('data-theme', id)
    appEl.setAttribute('data-theme', id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // Ignore storage failures (e.g. private mode); the in-memory state still works.
    }
  }

  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    saved = null
  }

  apply(isThemeId(saved) ? saved : DEFAULT_THEME)

  return {
    apply,
    current(): ThemeId {
      return active
    }
  }
}
