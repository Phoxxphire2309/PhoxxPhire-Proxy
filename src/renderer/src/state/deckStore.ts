import { create } from 'zustand'
import { DECK_FILE_VERSION, PROJECT_FILE_VERSION, type DeckSection } from '@shared/deck'
import type { DeckResolution } from '@shared/decklist'
import {
  bestPrinting,
  cheapestPrinting,
  mostExpensivePrinting,
  newestPrinting,
  nonFoilPrintings,
  type Card
} from '@shared/scryfall'
import { toast } from '@renderer/state/toastStore'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'

export interface DeckItem {
  card: Card
  quantities: number[]
  section: DeckSection
}

/** A loosely-typed item from disk/persistence (legacy `quantity`, optional section). */
export type LoadableItem = {
  card: Card
  quantities?: number[]
  quantity?: number
  section?: DeckSection
}

/** Number of printable faces a card has (1 for normal cards, 2 for double-faced). */
function facesOf(card: Card): number {
  return Math.max(1, card.faces.length)
}

export type BulkPrintingMode = 'highres' | 'cheapest' | 'expensive' | 'newest'

const BULK_LABELS: Record<BulkPrintingMode, string> = {
  highres: 'highest-resolution',
  cheapest: 'cheapest',
  expensive: 'most expensive',
  newest: 'newest'
}

interface DeckState {
  items: DeckItem[]
  importing: boolean
  importErrors: string[]
  bulkRunning: boolean
  /** Active bulk printing-switch job (drives the progress popup), or null when idle. */
  bulkJob: { total: number; done: number } | null
  /** Undo/redo history of the `items` list (oldest first in `past`). */
  past: DeckItem[][]
  future: DeckItem[][]
  undo: () => void
  redo: () => void
  add: (card: Card, quantity?: number) => void
  setItems: (items: LoadableItem[]) => void
  setFaceQuantity: (cardId: string, faceIndex: number, quantity: number) => void
  setSection: (cardId: string, section: DeckSection) => void
  replaceCard: (oldCardId: string, newCard: Card) => void
  remove: (cardId: string) => void
  clear: () => void
  bulkSwitchPrintings: (mode: BulkPrintingMode) => Promise<void>
  importText: (text: string, excludeFoils?: boolean) => Promise<void>
  importUrl: (url: string, excludeFoils?: boolean) => Promise<void>
  saveDeck: () => Promise<void>
  loadDeck: () => Promise<void>
  saveProject: () => Promise<void>
  loadProject: () => Promise<void>
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

/** Normalizes a possibly-legacy saved item to the current shape (defaulting section). */
export function normalizeItem(item: LoadableItem): DeckItem {
  const section: DeckSection = item.section ?? 'main'
  if (Array.isArray(item.quantities)) {
    return { card: item.card, quantities: [...item.quantities], section }
  }
  const quantity = typeof item.quantity === 'number' ? item.quantity : 1
  return { card: item.card, quantities: Array(facesOf(item.card)).fill(quantity), section }
}

export const useDeckStore = create<DeckState>((set, get) => ({
  items: [],
  importing: false,
  importErrors: [],
  bulkRunning: false,
  bulkJob: null,
  past: [],
  future: [],

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1]
      if (previous === undefined) return state
      applyingHistory = true
      return {
        items: previous,
        past: state.past.slice(0, -1),
        future: [state.items, ...state.future]
      }
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0]
      if (next === undefined) return state
      applyingHistory = true
      return { items: next, past: [...state.past, state.items], future: state.future.slice(1) }
    }),

  add: (card, quantity = 1) =>
    set((state) => ({
      items: mergeItems(state.items, [
        { card, quantities: Array(facesOf(card)).fill(quantity), section: 'main' }
      ])
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

  setSection: (cardId, section) =>
    set((state) => ({
      items: state.items.map((item) => (item.card.id === cardId ? { ...item, section } : item))
    })),

  replaceCard: (oldCardId, newCard) =>
    set((state) => ({
      items: state.items.map((item) => {
        if (item.card.id !== oldCardId) return item
        const oldQuantities = item.quantities
        const resized = Array.from(
          { length: facesOf(newCard) },
          (_unused, index) => oldQuantities[index] ?? oldQuantities[0] ?? 1
        )
        return { card: newCard, quantities: resized, section: item.section }
      })
    })),

  remove: (cardId) =>
    set((state) => ({ items: state.items.filter((item) => item.card.id !== cardId) })),

  clear: () => set({ items: [], importErrors: [] }),

  bulkSwitchPrintings: async (mode) => {
    const snapshot = get().items
    if (snapshot.length === 0 || get().bulkRunning) return
    set({ bulkRunning: true, bulkJob: { total: snapshot.length, done: 0 } })
    let changed = 0
    let done = 0
    try {
      for (const item of snapshot) {
        done += 1
        set({ bulkJob: { total: snapshot.length, done } })
        if (!item.card.oracleId) continue
        let printings: Card[]
        try {
          printings = await window.phoxx.getPrintings(item.card.oracleId)
        } catch {
          continue
        }
        if (printings.length === 0) continue
        // Prefer non-foil printings — foil/etched scans can print poorly.
        const pool = nonFoilPrintings(printings)
        const pick =
          mode === 'highres'
            ? bestPrinting(pool)
            : mode === 'cheapest'
              ? cheapestPrinting(pool)
              : mode === 'expensive'
                ? mostExpensivePrinting(pool)
                : newestPrinting(pool)
        if (pick && pick.id !== item.card.id) {
          get().replaceCard(item.card.id, pick)
          changed += 1
        }
      }
      toast(
        changed > 0
          ? `Switched ${changed} card(s) to the ${BULK_LABELS[mode]} printing`
          : 'No cards needed switching',
        'success'
      )
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Bulk switch failed', 'error')
    } finally {
      set({ bulkRunning: false, bulkJob: null })
    }
  },

  importText: (text, excludeFoils) =>
    runImport(set, () => window.phoxx.resolveDeck(text, excludeFoils)),
  importUrl: (url, excludeFoils) =>
    runImport(set, () => window.phoxx.importDeckUrl(url, excludeFoils)),

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

  saveProject: async () => {
    const { items } = get()
    if (items.length === 0) return
    try {
      const outcome = await window.phoxx.saveProject({
        version: PROJECT_FILE_VERSION,
        deck: { version: DECK_FILE_VERSION, items },
        pageSetup: usePageSetupStore.getState().options
      })
      if (!outcome.canceled) toast('Project saved', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save project', 'error')
    }
  },

  loadProject: async () => {
    try {
      const outcome = await window.phoxx.loadProject()
      if (outcome.canceled) return
      set({ items: outcome.project.deck.items.map(normalizeItem), importErrors: [] })
      usePageSetupStore.getState().replace(outcome.project.pageSetup)
      toast('Project loaded', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not load project', 'error')
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

/** Cap on undo history depth. */
const MAX_HISTORY = 50
/** Set while undo/redo applies a snapshot, so the recorder doesn't log that change. */
let applyingHistory = false
let lastRecordedItems = useDeckStore.getState().items

// Record every `items` change (except those made by undo/redo) into the past
// stack, clearing the redo stack on a fresh edit.
useDeckStore.subscribe((state) => {
  if (state.items === lastRecordedItems) return
  const previous = lastRecordedItems
  lastRecordedItems = state.items
  if (applyingHistory) {
    applyingHistory = false
    return
  }
  useDeckStore.setState((current) => ({
    past: [...current.past, previous].slice(-MAX_HISTORY),
    future: []
  }))
})

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
      quantities: Array(facesOf(item.card)).fill(item.quantity),
      section: 'main'
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
