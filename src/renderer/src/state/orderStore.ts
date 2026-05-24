import { create } from 'zustand'
import type { DeckItem } from '@renderer/state/deckStore'

/** One printable slot in the preview/export order (one per printed card image, or a blank spacer). */
export interface OrderSlot {
  cardId: string
  faceIndex: number
  /** A blank layout spacer — occupies a grid cell but prints nothing. */
  spacer?: boolean
}

interface OrderState {
  /** Fully expanded, user-orderable list of printable slots. */
  slots: OrderSlot[]
  /**
   * Rebuild the slot list from the deck, preserving manual order + spacers when
   * the card set is unchanged. When `pairBackFaces` is set (duplex printing), a
   * double-faced card becomes a single front slot — its second face prints on
   * the back — instead of expanding both faces as separate cards.
   */
  syncFromDeck: (items: DeckItem[], pairBackFaces?: boolean) => void
  /** Immutably move the slot at `fromIndex` to `toIndex`. */
  reorder: (fromIndex: number, toIndex: number) => void
  /** Append a blank spacer to the end of the order. */
  addSpacer: () => void
  /** Remove the slot at `index` (used to delete spacers). */
  removeAt: (index: number) => void
}

/** The deck-implied set of card slots (spacers excluded), ignoring order. */
function signature(slots: OrderSlot[]): string {
  return slots
    .filter((slot) => !slot.spacer)
    .map((slot) => `${slot.cardId}#${slot.faceIndex}`)
    .sort()
    .join('|')
}

/**
 * Expands a deck into one slot per copy per face, in deck order. Maybeboard is
 * skipped. When `pairBackFaces` is set, multi-faced cards emit only their front
 * face (the back face prints on the duplex reverse), so they count as one card.
 */
function expand(items: DeckItem[], pairBackFaces: boolean): OrderSlot[] {
  const slots: OrderSlot[] = []
  for (const item of items) {
    if (item.section === 'maybeboard') continue
    const faceCount = pairBackFaces ? 1 : item.quantities.length
    for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
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

  syncFromDeck: (items, pairBackFaces = false) => {
    const desired = expand(items, pairBackFaces)
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
    }),

  addSpacer: () =>
    set((state) => ({ slots: [...state.slots, { cardId: '', faceIndex: 0, spacer: true }] })),

  removeAt: (index) => set((state) => ({ slots: state.slots.filter((_slot, i) => i !== index) }))
}))
