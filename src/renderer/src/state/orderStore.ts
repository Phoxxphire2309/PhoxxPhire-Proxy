import { create } from 'zustand'
import type { DeckItem } from '@renderer/state/deckStore'

/** One printable slot in the preview/export order (one per printed card image). */
export interface OrderSlot {
  cardId: string
  faceIndex: number
}

interface OrderState {
  /** Fully expanded, user-orderable list of printable slots. */
  slots: OrderSlot[]
  /** Rebuild the slot list from the deck, preserving manual order when unchanged. */
  syncFromDeck: (items: DeckItem[]) => void
  /** Immutably move the slot at `fromIndex` to `toIndex`. */
  reorder: (fromIndex: number, toIndex: number) => void
}

/** The deck-implied set of slots, ignoring order (sorted multiset signature). */
function signature(slots: OrderSlot[]): string {
  return slots
    .map((slot) => `${slot.cardId}#${slot.faceIndex}`)
    .sort()
    .join('|')
}

/** Expands a deck into one slot per copy per face, in deck order. Maybeboard is skipped. */
function expand(items: DeckItem[]): OrderSlot[] {
  const slots: OrderSlot[] = []
  for (const item of items) {
    if (item.section === 'maybeboard') continue
    for (let faceIndex = 0; faceIndex < item.quantities.length; faceIndex += 1) {
      for (let copy = 0; copy < item.quantities[faceIndex]!; copy += 1) {
        slots.push({ cardId: item.card.id, faceIndex })
      }
    }
  }
  return slots
}

/** Ordered slot list driving the print preview and export. */
export const useOrderStore = create<OrderState>((set, get) => ({
  slots: [],

  syncFromDeck: (items) => {
    const desired = expand(items)
    // Same multiset of slots → keep the current (possibly manually reordered) list.
    if (signature(desired) === signature(get().slots)) return
    set({ slots: desired })
  },

  reorder: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.slots.length ||
        toIndex >= state.slots.length
      ) {
        return state
      }
      const slots = [...state.slots]
      const [moved] = slots.splice(fromIndex, 1)
      slots.splice(toIndex, 0, moved!)
      return { slots }
    })
}))
