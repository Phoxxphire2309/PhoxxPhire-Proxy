import { create } from 'zustand'
import { DECK_FILE_VERSION } from '@shared/deck'
import type { DeckResolution } from '@shared/decklist'
import type { Card } from '@shared/scryfall'
import { toast } from '@renderer/state/toastStore'

export interface DeckItem {
  card: Card
  quantity: number
}

interface DeckState {
  items: DeckItem[]
  importing: boolean
  importErrors: string[]
  add: (card: Card, quantity?: number) => void
  setItems: (items: DeckItem[]) => void
  setQuantity: (cardId: string, quantity: number) => void
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
  const merged = existing.map((item) => ({ ...item }))
  for (const item of incoming) {
    const found = merged.find((candidate) => candidate.card.id === item.card.id)
    if (found) {
      found.quantity += item.quantity
    } else {
      merged.push({ ...item })
    }
  }
  return merged
}

export const useDeckStore = create<DeckState>((set, get) => ({
  items: [],
  importing: false,
  importErrors: [],

  add: (card, quantity = 1) =>
    set((state) => ({ items: mergeItems(state.items, [{ card, quantity }]) })),

  setItems: (items) => set({ items }),

  setQuantity: (cardId, quantity) =>
    set((state) => ({
      items:
        quantity <= 0
          ? state.items.filter((item) => item.card.id !== cardId)
          : state.items.map((item) => (item.card.id === cardId ? { ...item, quantity } : item))
    })),

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
      set({ items: outcome.deck.items, importErrors: [] })
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
    set({
      items: mergeItems(useDeckStore.getState().items, result.items),
      importErrors: result.errors,
      importing: false
    })
  } catch (error) {
    set({
      importing: false,
      importErrors: [error instanceof Error ? error.message : 'Import failed']
    })
  }
}
