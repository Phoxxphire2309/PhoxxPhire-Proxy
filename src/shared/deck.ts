import type { ExportOptions } from './layout'
import type { Card } from './scryfall'

export const DECK_FILE_VERSION = 3
export const PROJECT_FILE_VERSION = 1

/** Which part of the deck a card belongs to. Only printable sections export. */
export type DeckSection = 'main' | 'commander' | 'sideboard' | 'maybeboard'

/** Sections in display order. */
export const DECK_SECTIONS: DeckSection[] = ['commander', 'main', 'sideboard', 'maybeboard']

export const DECK_SECTION_LABELS: Record<DeckSection, string> = {
  commander: 'Commander',
  main: 'Main deck',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard'
}

/** The maybeboard is a holding area — everything else prints. */
export function isPrintableSection(section: DeckSection): boolean {
  return section !== 'maybeboard'
}

export interface SavedDeckItem {
  card: Card
  quantities: number[]
  section?: DeckSection
}

export interface SavedDeck {
  version: number
  items: SavedDeckItem[]
}

export type DeckSaveOutcome = { canceled: true } | { canceled: false; path: string }
export type DeckLoadOutcome = { canceled: true } | { canceled: false; deck: SavedDeck }

/** A full project: the deck plus its page-setup, so a print job is reproducible. */
export interface SavedProject {
  version: number
  deck: SavedDeck
  pageSetup: ExportOptions
}

export type ProjectSaveOutcome = { canceled: true } | { canceled: false; path: string }
export type ProjectLoadOutcome = { canceled: true } | { canceled: false; project: SavedProject }
