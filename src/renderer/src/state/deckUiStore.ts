import { create } from 'zustand'

/** The deck-related modals; only one is open at a time (each is a full overlay). */
export type DeckModal =
  | 'import'
  | 'tokens'
  | 'lands'
  | 'collection'
  | 'export'
  | 'preview'
  | 'pageSetup'
  | 'sampleHand'

interface DeckUiState {
  modal: DeckModal | null
  /** Whether the stats/breakdown panel is expanded (Decks view shows it by default). */
  showStats: boolean
  open: (modal: DeckModal) => void
  close: () => void
  toggleStats: () => void
}

/**
 * Shared open-state for the deck dialogs and the stats panel, so the Decks
 * view's middle grid and right action panel can both trigger them while the
 * dialogs themselves are rendered once.
 */
export const useDeckUiStore = create<DeckUiState>((set) => ({
  modal: null,
  showStats: true,
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
  toggleStats: () => set((state) => ({ showStats: !state.showStats }))
}))
