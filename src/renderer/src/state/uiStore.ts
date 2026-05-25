import { create } from 'zustand'
import type { ThemeName } from '@shared/appState'
import type { GroupBy } from '@shared/deckGroup'

/** The primary view selected from the left nav. */
export type AppView = 'search' | 'decks' | 'settings'

interface UiState {
  theme: ThemeName
  /** Active primary view (left nav → middle content). */
  view: AppView
  /** How the Decks view groups cards. */
  deckGroupBy: GroupBy
  /** Whether the first-run onboarding has been dismissed. */
  onboarded: boolean
  /** Whether the quick-tour overlay is open. */
  tourOpen: boolean
  setTheme: (theme: ThemeName) => void
  toggleTheme: () => void
  setView: (view: AppView) => void
  setDeckGroupBy: (groupBy: GroupBy) => void
  setOnboarded: (value: boolean) => void
  setTourOpen: (value: boolean) => void
}

/** Reflects the theme onto the document so CSS variables switch. */
function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'dark',
  view: 'search',
  deckGroupBy: 'none',
  onboarded: false,
  tourOpen: false,
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setView: (view) => set({ view }),
  setDeckGroupBy: (deckGroupBy) => set({ deckGroupBy }),
  setOnboarded: (value) => set({ onboarded: value }),
  setTourOpen: (value) => set({ tourOpen: value })
}))
