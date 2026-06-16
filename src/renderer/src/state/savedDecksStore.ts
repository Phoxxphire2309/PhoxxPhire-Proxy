import { create } from 'zustand'
import { normalizeItem, type DeckItem, type LoadableItem } from '@renderer/state/deckStore'

/** A deck stored in the library, kept across sessions and re-loadable into a tab. */
export interface SavedDeck {
  id: string
  name: string
  items: DeckItem[]
}

interface SavedDecksState {
  decks: SavedDeck[]
  /** Save a snapshot of the given deck under `name`, overwriting one with the same name. */
  save: (name: string, items: DeckItem[]) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  /** Restore the library from persistence. */
  restore: (decks: { id: string; name: string; items: LoadableItem[] }[]) => void
}

function snapshotItems(items: DeckItem[]): DeckItem[] {
  return items.map((item) => ({
    card: item.card,
    quantities: [...item.quantities],
    section: item.section
  }))
}

/** The deck library: named deck snapshots the user can re-open and print later. */
export const useSavedDecksStore = create<SavedDecksState>((set) => ({
  decks: [],

  save: (name, items) =>
    set((state) => {
      const trimmed = name.trim() || 'Untitled deck'
      const items2 = snapshotItems(items)
      const existing = state.decks.find((deck) => deck.name === trimmed)
      if (existing) {
        return {
          decks: state.decks.map((deck) =>
            deck.id === existing.id ? { ...deck, items: items2 } : deck
          )
        }
      }
      return { decks: [...state.decks, { id: crypto.randomUUID(), name: trimmed, items: items2 }] }
    }),

  remove: (id) => set((state) => ({ decks: state.decks.filter((deck) => deck.id !== id) })),

  rename: (id, name) =>
    set((state) => ({
      decks: state.decks.map((deck) =>
        deck.id === id ? { ...deck, name: name.trim() || deck.name } : deck
      )
    })),

  restore: (decks) =>
    set({
      decks: decks.map((deck) => ({
        id: deck.id,
        name: deck.name,
        items: deck.items.map(normalizeItem)
      }))
    })
}))
