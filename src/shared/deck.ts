import type { Card } from './scryfall'

export const DECK_FILE_VERSION = 1

export interface SavedDeckItem {
  card: Card
  quantity: number
}

export interface SavedDeck {
  version: number
  items: SavedDeckItem[]
}

export type DeckSaveOutcome = { canceled: true } | { canceled: false; path: string }
export type DeckLoadOutcome = { canceled: true } | { canceled: false; deck: SavedDeck }
