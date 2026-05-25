import { create } from 'zustand'
import type { Card } from '@shared/scryfall'
import {
  composeQuery,
  EMPTY_FILTERS,
  sortParams,
  type SearchFilters,
  type SortKey
} from '@shared/scryfallQuery'

type SearchStatus = 'idle' | 'loading' | 'error'
export type ViewMode = 'grid' | 'list'

const MAX_RECENTS = 8
/** Scryfall returns up to this many cards per page. */
export const PAGE_SIZE = 175
/** Debounce for auto-searching as filters change. */
const FILTER_DEBOUNCE_MS = 350
let filterDebounce: ReturnType<typeof setTimeout> | undefined

interface SearchState {
  query: string
  filters: SearchFilters
  cards: Card[]
  totalCards: number
  status: SearchStatus
  error: string | null
  sort: SortKey
  viewMode: ViewMode
  /** 1-based page of the current result set. */
  page: number
  hasMore: boolean
  /** Recent non-empty search queries, most recent first. */
  recents: string[]
  setQuery: (query: string) => void
  setFilters: (filters: Partial<SearchFilters>) => void
  resetFilters: () => void
  setSort: (sort: SortKey) => void
  setViewMode: (viewMode: ViewMode) => void
  /** Run a search from page 1 (used by the search box + filters). */
  search: () => Promise<void>
  /** Jump to a specific page of the current query, keeping filters + sort. */
  goToPage: (page: number) => Promise<void>
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  filters: EMPTY_FILTERS,
  cards: [],
  totalCards: 0,
  status: 'idle',
  error: null,
  sort: 'relevance',
  viewMode: 'grid',
  page: 1,
  hasMore: false,
  recents: [],

  setQuery: (query) => set({ query }),
  setFilters: (filters) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }))
    clearTimeout(filterDebounce)
    filterDebounce = setTimeout(() => void get().search(), FILTER_DEBOUNCE_MS)
  },
  resetFilters: () => {
    set({ filters: EMPTY_FILTERS })
    clearTimeout(filterDebounce)
    filterDebounce = setTimeout(() => void get().search(), FILTER_DEBOUNCE_MS)
  },
  setSort: (sort) => {
    set({ sort })
    void get().search()
  },
  setViewMode: (viewMode) => set({ viewMode }),

  search: () => get().goToPage(1),

  goToPage: async (page) => {
    const { query, filters, sort } = get()
    const composed = composeQuery(query, filters)
    if (!composed) {
      set({ cards: [], totalCards: 0, status: 'idle', error: null, page: 1, hasMore: false })
      return
    }

    set({ status: 'loading', error: null })
    try {
      const result = await window.phoxx.searchCards(composed, { ...sortParams(sort), page })
      const term = query.trim()
      const recents = term
        ? [term, ...get().recents.filter((r) => r !== term)].slice(0, MAX_RECENTS)
        : get().recents
      set({
        cards: result.cards,
        totalCards: result.totalCards,
        hasMore: result.hasMore,
        page,
        status: 'idle',
        recents
      })
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Search failed',
        cards: [],
        totalCards: 0,
        hasMore: false
      })
    }
  }
}))
