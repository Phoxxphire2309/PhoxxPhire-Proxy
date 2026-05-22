import type { Card } from './scryfall'

export type ThemeName = 'dark' | 'light'

/** Persisted application state, restored on launch. */
export interface AppState {
  deck?: { card: Card; quantity: number }[]
  upscale?: { model: string; scale: number }
  showSource?: boolean
  theme?: ThemeName
}
