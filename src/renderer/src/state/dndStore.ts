import { create } from 'zustand'
import type { Card } from '@shared/scryfall'

interface DndState {
  /** The card currently being dragged from the search grid, or null. */
  draggingCard: Card | null
  setDragging: (card: Card | null) => void
}

/** Tracks a card drag so drop targets (e.g. the Decks nav) can add it. */
export const useDndStore = create<DndState>((set) => ({
  draggingCard: null,
  setDragging: (card) => set({ draggingCard: card })
}))
