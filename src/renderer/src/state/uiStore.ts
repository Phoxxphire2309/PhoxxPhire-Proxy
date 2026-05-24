import { create } from 'zustand'
import type { ThemeName } from '@shared/appState'

interface UiState {
  theme: ThemeName
  /** Whether the first-run onboarding has been dismissed. */
  onboarded: boolean
  setTheme: (theme: ThemeName) => void
  toggleTheme: () => void
  setOnboarded: (value: boolean) => void
}

/** Reflects the theme onto the document so CSS variables switch. */
function applyTheme(theme: ThemeName): void {
  document.documentElement.dataset.theme = theme
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'dark',
  onboarded: false,
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setOnboarded: (value) => set({ onboarded: value })
}))
