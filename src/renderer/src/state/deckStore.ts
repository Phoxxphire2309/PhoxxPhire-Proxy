import { create } from 'zustand'
import { DECK_FILE_VERSION } from '@shared/deck'
import type { DeckResolution } from '@shared/decklist'
import type { Card } from '@shared/scryfall'
import { toast } from '@renderer/state/toastStore'

export interface DeckItem {
  card: Card
  quantities: number[]
}

/** Number of printable faces a card has (1 for normal cards, 2 for double-faced). */
function facesOf(card: Card): number {
  return Math.max(1, card.faces.length)
}

interface DeckState {
  items: DeckItem[]
  importing: boolean
  importErrors: string[]
  add: (card: Card, quantity?: number) => void
  setItems: (items: DeckItem[]) => void
  setFaceQuantity: (cardId: string, faceIndex: number, quantity: number) => void
  remove: (cardId: string) => void
  clear: () => void
  importText: (text: string) => Promise<void>
  importUrl: (url: string) => Promise<void>
  saveDeck: () => Promise<void>
  loadDeck: () => Promise<void>
  addCustomCard: () => Promise<void>
}

/** Adds resolved items into an existing list, merging by card id (immutably). */
function mergeItems(existing: DeckItem[], incoming: DeckItem[]): DeckItem[] {
  const merged = existing.map((item) => ({ ...item, quantities: [...item.quantities] }))
  for (const item of incoming) {
    const found = merged.find((candidate) => candidate.card.id === item.card.id)
    if (found) {
      // Same card → same face count, so sum element-wise by index.
      found.quantities = found.quantities.map(
        (value, index) => value + (item.quantities[index] ?? 0)
      )
    } else {
      merged.push({ ...item, quantities: [...item.quantities] })
    }
  }
  return merged
}

/** Normalizes a possibly-legacy saved item ({ quantity }) to the per-face shape. */
function normalizeItem(item: DeckItem | { card: Card; quantity: number }): DeckItem {
  if ('quantities' in item && Array.isArray(item.quantities)) {
    return { card: item.card, quantities: [...item.quantities] }
  }
  const quantity = 'quantity' in item ? item.quantity : 1
  return { card: item.card, quantities: Array(facesOf(item.card)).fill(quantity) }
}

export const useDeckStore = create<DeckState>((set, get) => ({
  items: [],
  importing: false,
  importErrors: [],

  add: (card, quantity = 1) =>
    set((state) => ({
      items: mergeItems(state.items, [{ card, quantities: Array(facesOf(card)).fill(quantity) }])
    })),

  setItems: (items) => set({ items: items.map(normalizeItem) }),

  setFaceQuantity: (cardId, faceIndex, quantity) =>
    set((state) => {
      const next = quantity < 0 ? 0 : quantity
      const items: DeckItem[] = []
      for (const item of state.items) {
        if (item.card.id !== cardId) {
          items.push(item)
          continue
        }
        const quantities = item.quantities.map((value, index) =>
          index === faceIndex ? next : value
        )
        // Drop the card entirely once every face is at zero.
        if (quantities.some((value) => value > 0)) {
          items.push({ ...item, quantities })
        }
      }
      return { items }
    }),

  remove: (cardId) =>
    set((state) => ({ items: state.items.filter((item) => item.card.id !== cardId) })),

  clear: () => set({ items: [], importErrors: [] }),

  importText: (text) => runImport(set, () => window.phoxx.resolveDeck(text)),
  importUrl: (url) => runImport(set, () => window.phoxx.importDeckUrl(url)),

  saveDeck: async () => {
    const { items } = get()
    if (items.length === 0) return
    try {
      const outcome = await window.phoxx.saveDeck({ version: DECK_FILE_VERSION, items })
      if (!outcome.canceled) toast('Deck saved', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save deck', 'error')
    }
  },

  loadDeck: async () => {
    try {
      const outcome = await window.phoxx.loadDeck()
      if (outcome.canceled) return
      set({ items: outcome.deck.items.map(normalizeItem), importErrors: [] })
      toast(`Loaded ${outcome.deck.items.length} card(s)`, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load deck', 'error')
    }
  },

  addCustomCard: async () => {
    try {
      const card = await window.phoxx.importCustomCard()
      if (card) {
        get().add(card)
        toast(`Added custom card “${card.name}”`, 'success')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add custom card', 'error')
    }
  }
}))

/** Shared import flow for text and URL imports. */
async function runImport(
  set: (partial: Partial<DeckState>) => void,
  fetchResult: () => Promise<DeckResolution>
): Promise<void> {
  set({ importing: true, importErrors: [] })
  try {
    const result = await fetchResult()
    const incoming: DeckItem[] = result.items.map((item) => ({
      card: item.card,
      quantities: Array(facesOf(item.card)).fill(item.quantity)
    }))
    set({
      items: mergeItems(useDeckStore.getState().items, incoming),
      importErrors: result.errors,
      importing: false
    })
  } catch (error) {
    // A whole-import failure (e.g. a blocked deck URL) isn't a per-line issue,
    // so surface it as a toast rather than the "lines couldn't be resolved" list.
    set({ importing: false, importErrors: [] })
    toast(error instanceof Error ? error.message : 'Import failed', 'error')
  }
}
