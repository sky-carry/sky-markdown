import type { SkyApi } from '../shared/ipc'

declare global {
  interface Window {
    api: SkyApi
  }
}

export {}
