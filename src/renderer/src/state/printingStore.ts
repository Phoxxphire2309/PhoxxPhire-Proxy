import { create } from 'zustand'
import type { Card } from '@shared/scryfall'

interface PrintingState {
  /** Chosen printing per search-result card id (overrides the default printing). */
  overrides: Record<string, Card>
  /** The search-result card id whose detail modal is open, or null. */
  detailCardId: string | null
  open: (cardId: string) => void
  close: () => void
  choose: (originalCardId: string, printing: Card) => void
}

export const usePrintingStore = create<PrintingState>((set) => ({
  overrides: {},
  detailCardId: null,
  open: (detailCardId) => set({ detailCardId }),
  close: () => set({ detailCardId: null }),
  choose: (originalCardId, printing) =>
    set((state) => ({ overrides: { ...state.overrides, [originalCardId]: printing } }))
}))
