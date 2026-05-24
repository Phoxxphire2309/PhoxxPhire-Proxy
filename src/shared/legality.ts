import type { Card } from './scryfall'

/** Constructed/eternal formats we surface legality checks for, in display order. */
export const DECK_FORMATS = [
  'standard',
  'pioneer',
  'modern',
  'pauper',
  'legacy',
  'vintage',
  'commander'
] as const

export type DeckFormat = (typeof DECK_FORMATS)[number]

export const DECK_FORMAT_LABELS: Record<DeckFormat, string> = {
  standard: 'Standard',
  pioneer: 'Pioneer',
  modern: 'Modern',
  pauper: 'Pauper',
  legacy: 'Legacy',
  vintage: 'Vintage',
  commander: 'Commander'
}

/** A card's legality in a format. `unknown` = Scryfall didn't tell us (e.g. stale cache). */
export type Legality = 'legal' | 'not_legal' | 'banned' | 'restricted' | 'unknown'

const KNOWN: ReadonlySet<string> = new Set(['legal', 'not_legal', 'banned', 'restricted'])

/** Scryfall's legality for a card in a format, or `unknown` when unavailable. */
export function legalityIn(card: Pick<Card, 'legalities'>, format: DeckFormat): Legality {
  const value = card.legalities?.[format]
  return value && KNOWN.has(value) ? (value as Legality) : 'unknown'
}

/**
 * Whether a known legality should be flagged as a deck-building problem.
 * `legal` and `restricted` are fine to include; `restricted` is enforced as a
 * one-copy limit elsewhere. `unknown` is never flagged (we just don't know).
 */
export function isIllegal(status: Legality): boolean {
  return status === 'not_legal' || status === 'banned'
}
