import { create } from 'zustand'
import type { ThemeName } from '@shared/appState'

/** The primary view selected from the left nav. */
export type AppView = 'search' | 'decks' | 'settings'

interface UiState {
  theme: ThemeName
  /** Active primary view (left nav → middle content). */
  view: AppView
  /** Whether the first-run onboarding has been dismissed. */
  onboarded: boolean
  setTheme: (theme: ThemeName) => void
  toggleTheme: () => void
  setView: (view: AppView) => void
  setOnboarded: (value: boolean) => void
}

/** Reflects the theme onto the document so CSS variables switch. */
function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'dark',
  view: 'search',
  onboarded: false,
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setView: (view) => set({ view }),
  setOnboarded: (value) => set({ onboarded: value })
}))
