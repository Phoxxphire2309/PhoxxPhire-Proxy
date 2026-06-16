import { create } from 'zustand'
import {
  normalizeItem,
  useDeckStore,
  type DeckItem,
  type LoadableItem
} from '@renderer/state/deckStore'

/** One named deck. The active tab's cards live in the deck store; inactive tabs hold snapshots. */
export interface DeckTab {
  id: string
  name: string
  items: DeckItem[]
}

let counter = 0
function newId(): string {
  counter += 1
  return `deck-${Date.now()}-${counter}`
}

interface DecksState {
  tabs: DeckTab[]
  activeId: string
  newTab: () => void
  switchTab: (id: string) => void
  closeTab: (id: string) => void
  renameTab: (id: string, name: string) => void
  /** Open a saved deck in a new active tab (used by the deck library). */
  loadDeck: (name: string, items: DeckItem[]) => void
  /** Sync the live deck items into the active tab. Call before persisting/switching. */
  commitActive: () => void
  /** Restore tabs (e.g. from persistence) and load the active deck's cards. */
  restore: (tabs: { id: string; name: string; items: LoadableItem[] }[], activeId: string) => void
}

/** Loads a tab's cards into the (single) deck store, resetting its undo history. */
function loadIntoDeck(items: DeckItem[]): void {
  useDeckStore.setState({ items, past: [], future: [] })
}

const firstId = newId()

/** Manages multiple named decks as tabs over the single active deck store. */
export const useDecksStore = create<DecksState>((set, get) => ({
  tabs: [{ id: firstId, name: 'Deck 1', items: [] }],
  activeId: firstId,

  commitActive: () =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === state.activeId ? { ...tab, items: useDeckStore.getState().items } : tab
      )
    })),

  switchTab: (id) => {
    if (id === get().activeId) return
    get().commitActive()
    const target = get().tabs.find((tab) => tab.id === id)
    if (!target) return
    loadIntoDeck(target.items)
    set({ activeId: id })
  },

  newTab: () => {
    get().commitActive()
    const id = newId()
    set((state) => ({
      tabs: [...state.tabs, { id, name: `Deck ${state.tabs.length + 1}`, items: [] }],
      activeId: id
    }))
    loadIntoDeck([])
  },

  /** Open a saved deck in a new active tab (used by the deck library). */
  loadDeck: (name, items) => {
    get().commitActive()
    const id = newId()
    const copied = items.map((item) => ({
      card: item.card,
      quantities: [...item.quantities],
      section: item.section
    }))
    set((state) => ({ tabs: [...state.tabs, { id, name, items: copied }], activeId: id }))
    loadIntoDeck(copied)
  },

  closeTab: (id) => {
    const { tabs, activeId } = get()
    // Never remove the final tab — just empty it.
    if (tabs.length <= 1) {
      loadIntoDeck([])
      set((state) => ({ tabs: state.tabs.map((tab) => ({ ...tab, items: [] })) }))
      return
    }
    const index = tabs.findIndex((tab) => tab.id === id)
    if (index === -1) return
    const remaining = tabs.filter((tab) => tab.id !== id)
    if (id === activeId) {
      const next = remaining[Math.max(0, index - 1)]!
      loadIntoDeck(next.items)
      set({ tabs: remaining, activeId: next.id })
    } else {
      set({ tabs: remaining })
    }
  },

  renameTab: (id, name) =>
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, name: name.trim() || tab.name } : tab
      )
    })),

  restore: (tabs, activeId) => {
    if (tabs.length === 0) return
    const normalized: DeckTab[] = tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      items: tab.items.map(normalizeItem)
    }))
    const active = normalized.find((tab) => tab.id === activeId) ?? normalized[0]!
    set({ tabs: normalized, activeId: active.id })
    loadIntoDeck(active.items)
  }
}))
