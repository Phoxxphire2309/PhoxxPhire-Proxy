import type { DeckSection } from './deck'
import type { ExportOptions } from './layout'
import type { Card } from './scryfall'

export type ThemeName = 'dark' | 'light'

type SavedDeckItemLite = { card: Card; quantities: number[]; section?: DeckSection }

/** Persisted application state, restored on launch. */
export interface AppState {
  /** Legacy single-deck field; still written for back-compat with older versions. */
  deck?: SavedDeckItemLite[]
  /** Multiple deck tabs (preferred over `deck` when present). */
  decks?: { id: string; name: string; items: SavedDeckItemLite[] }[]
  activeDeckId?: string
  upscale?: { model: string; scale: number }
  showSource?: boolean
  theme?: ThemeName
  onboarded?: boolean
  pageSetup?: ExportOptions
  collection?: { owned: string[]; skipOwned: boolean }
  /** UI preferences: active view, deck grouping, and search sort/view mode. */
  ui?: {
    view?: string
    deckGroupBy?: string
    sort?: string
    viewMode?: string
  }
}
