import { create } from 'zustand'
import type { Card } from '@shared/scryfall'
import { composeQuery, EMPTY_FILTERS, type SearchFilters } from '@shared/scryfallQuery'

type SearchStatus = 'idle' | 'loading' | 'error'

interface SearchState {
  query: string
  filters: SearchFilters
  cards: Card[]
  totalCards: number
  status: SearchStatus
  error: string | null
  setQuery: (query: string) => void
  setFilters: (filters: Partial<SearchFilters>) => void
  resetFilters: () => void
  search: () => Promise<void>
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  filters: EMPTY_FILTERS,
  cards: [],
  totalCards: 0,
  status: 'idle',
  error: null,

  setQuery: (query) => set({ query }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),

  search: async () => {
    const { query, filters } = get()
    const composed = composeQuery(query, filters)
    if (!composed) {
      set({ cards: [], totalCards: 0, status: 'idle', error: null })
      return
    }

    set({ status: 'loading', error: null })
    try {
      const result = await window.phoxx.searchCards(composed)
      set({ cards: result.cards, totalCards: result.totalCards, status: 'idle' })
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Search failed',
        cards: [],
        totalCards: 0
      })
    }
  }
}))
