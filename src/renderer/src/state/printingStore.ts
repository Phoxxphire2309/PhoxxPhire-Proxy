import { create } from 'zustand'
import type { Card } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'

interface PrintingState {
  /** Chosen printing per search-result card id (overrides the default printing). */
  overrides: Record<string, Card>
  /** The card currently shown in the detail modal, or null when closed. */
  detailCard: Card | null
  /** Where the modal was opened from: a search-grid result or a deck row. */
  origin: 'grid' | 'deck'
  /** Grid: the result card id whose override is updated. Deck: the deck card id to replace. */
  originKey: string
  openGrid: (resultCardId: string, card: Card) => void
  openDeck: (card: Card) => void
  close: () => void
  choose: (printing: Card) => void
}

export const usePrintingStore = create<PrintingState>((set, get) => ({
  overrides: {},
  detailCard: null,
  origin: 'grid',
  originKey: '',
  openGrid: (resultCardId, card) =>
    set({ detailCard: card, origin: 'grid', originKey: resultCardId }),
  openDeck: (card) => set({ detailCard: card, origin: 'deck', originKey: card.id }),
  close: () => set({ detailCard: null }),
  choose: (printing) => {
    const { origin, originKey } = get()
    if (origin === 'grid') {
      set((state) => ({
        overrides: { ...state.overrides, [originKey]: printing },
        detailCard: printing
      }))
    } else {
      useDeckStore.getState().replaceCard(originKey, printing)
      set({ originKey: printing.id, detailCard: printing })
    }
  }
}))
