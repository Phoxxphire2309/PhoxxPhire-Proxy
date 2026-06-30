import type { DeckSection } from './deck'
import type { ExportOptions } from './layout'
import type { MpcfillSelection } from './mpcfill'
import type { Card } from './scryfall'

export type ThemeName = 'dark' | 'light'

/** A named, saved page-setup profile (e.g. "Home inkjet", "Print-shop A3 + bleed"). */
export interface PagePreset {
  id: string
  name: string
  options: ExportOptions
}

type SavedDeckItemLite = { card: Card; quantities: number[]; section?: DeckSection }

/** Persisted application state, restored on launch. */
export interface AppState {
  /** Legacy single-deck field; still written for back-compat with older versions. */
  deck?: SavedDeckItemLite[]
  /** Multiple deck tabs (preferred over `deck` when present). */
  decks?: { id: string; name: string; items: SavedDeckItemLite[] }[]
  activeDeckId?: string
  /** The deck library: named deck snapshots the user can re-open and print later. */
  savedDecks?: { id: string; name: string; items: SavedDeckItemLite[] }[]
  upscale?: { model: string; scale: number }
  /** Card ids the user has upscaled, so deck health stays accurate across launches. */
  upscaledCardIds?: string[]
  showSource?: boolean
  theme?: ThemeName
  onboarded?: boolean
  /** App version last seen, so the changelog can auto-open after an update. */
  lastSeenVersion?: string
  pageSetup?: ExportOptions
  /** Saved page-setup presets the user can switch between. */
  pagePresets?: PagePreset[]
  collection?: { owned: string[]; skipOwned: boolean }
  /** Enabled printing-filter keys (hide funny/borderless/banned-in-format/… versions). */
  printingFilters?: string[]
  /** Per-card MPCFill art picks, keyed by `<cardId>:<faceIndex>`; cards without a
   * pick use their Scryfall scan. */
  mpcfillSelections?: Record<string, MpcfillSelection>
  /** UI preferences: active view, deck grouping, and search sort/view mode. */
  ui?: {
    view?: string
    deckGroupBy?: string
    deckSortBy?: string
    sort?: string
    viewMode?: string
  }
}
