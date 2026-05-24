import { create } from 'zustand'
import { parseDecklist } from '@shared/decklist'

/** Normalise a card name for owned-collection matching (case/space-insensitive). */
function key(name: string): string {
  return name.trim().toLowerCase()
}

interface CollectionState {
  /** Owned card names (normalised), as a lookup. */
  owned: Record<string, true>
  /** When true, export skips cards you already own (unless forced). */
  skipOwned: boolean
  /** Card ids the user has chosen to print anyway despite owning them. */
  forcePrint: Record<string, true>
  importOwned: (text: string) => number
  clearOwned: () => void
  setSkipOwned: (value: boolean) => void
  toggleForce: (cardId: string) => void
  restore: (owned: string[], skipOwned: boolean) => void
  isOwned: (name: string) => boolean
  ownedCount: () => number
}

/** Tracks which cards you physically own, so exports can skip them. */
export const useCollectionStore = create<CollectionState>((set, get) => ({
  owned: {},
  skipOwned: false,
  forcePrint: {},

  importOwned: (text) => {
    const names = parseDecklist(text).map((line) => key(line.name))
    if (names.length === 0) return 0
    set((state) => {
      const owned = { ...state.owned }
      for (const name of names) owned[name] = true
      return { owned }
    })
    return names.length
  },

  clearOwned: () => set({ owned: {}, forcePrint: {} }),

  setSkipOwned: (value) => set({ skipOwned: value }),

  toggleForce: (cardId) =>
    set((state) => {
      const forcePrint = { ...state.forcePrint }
      if (forcePrint[cardId]) delete forcePrint[cardId]
      else forcePrint[cardId] = true
      return { forcePrint }
    }),

  restore: (owned, skipOwned) =>
    set({ owned: Object.fromEntries(owned.map((name) => [key(name), true])), skipOwned }),

  isOwned: (name) => get().owned[key(name)] === true,
  ownedCount: () => Object.keys(get().owned).length
}))
