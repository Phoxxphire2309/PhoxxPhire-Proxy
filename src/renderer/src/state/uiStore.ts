import { create } from 'zustand'
import type { ThemeName } from '@shared/appState'
import type { GroupBy } from '@shared/deckGroup'
import type { DeckSortKey } from '@shared/deckSort'

/** The primary view selected from the left nav. */
export type AppView = 'search' | 'decks' | 'settings'

interface UiState {
  theme: ThemeName
  /** Active primary view (left nav → middle content). */
  view: AppView
  /** How the Decks view groups cards. */
  deckGroupBy: GroupBy
  /** How the Decks view orders cards (within each group). */
  deckSortBy: DeckSortKey
  /** Whether the first-run onboarding has been dismissed. */
  onboarded: boolean
  /** Whether the quick-tour overlay is open. */
  tourOpen: boolean
  /** Whether the "What's new" changelog overlay is open. */
  changelogOpen: boolean
  /** App version last seen, so the changelog can auto-open after an update. */
  lastSeenVersion: string | null
  setTheme: (theme: ThemeName) => void
  toggleTheme: () => void
  setView: (view: AppView) => void
  setDeckGroupBy: (groupBy: GroupBy) => void
  setDeckSortBy: (sortBy: DeckSortKey) => void
  setOnboarded: (value: boolean) => void
  setTourOpen: (value: boolean) => void
  setChangelogOpen: (value: boolean) => void
  setLastSeenVersion: (version: string) => void
}

/** Reflects the theme onto the document so CSS variables switch. */
function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'dark',
  view: 'search',
  deckGroupBy: 'none',
  deckSortBy: 'manual',
  onboarded: false,
  tourOpen: false,
  changelogOpen: false,
  lastSeenVersion: null,
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setView: (view) => set({ view }),
  setDeckGroupBy: (deckGroupBy) => set({ deckGroupBy }),
  setDeckSortBy: (deckSortBy) => set({ deckSortBy }),
  setOnboarded: (value) => set({ onboarded: value }),
  setTourOpen: (value) => set({ tourOpen: value }),
  setChangelogOpen: (value) => set({ changelogOpen: value }),
  setLastSeenVersion: (version) => set({ lastSeenVersion: version })
}))
