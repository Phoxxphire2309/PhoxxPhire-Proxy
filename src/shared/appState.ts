import type { DeckSection } from './deck'
import type { ExportOptions } from './layout'
import type { Card } from './scryfall'

export type ThemeName = 'dark' | 'light'

/** Persisted application state, restored on launch. */
export interface AppState {
  deck?: { card: Card; quantities: number[]; section?: DeckSection }[]
  upscale?: { model: string; scale: number }
  showSource?: boolean
  theme?: ThemeName
  pageSetup?: ExportOptions
}
