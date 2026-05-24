import { bestUsd, type Card } from './scryfall'

/** One deck entry for statistics: a card and how many copies it contributes. */
export interface DeckStatsInput {
  card: Card
  count: number
}

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C'

export interface DeckStats {
  /** Total physical cards. */
  total: number
  /** Land count (excluded from the mana curve). */
  lands: number
  /** Copies by mana value: index 0–6, with index 7 meaning "7 or more". Non-lands only. */
  curve: number[]
  /** Copies per colour; `C` is colourless non-lands. Multicolour cards count in each colour. */
  colors: Record<ManaColor, number>
  /** Copies per primary card type. */
  types: Record<string, number>
  /** Estimated total market value. */
  value: number
}

/** Card types in the priority order used to pick a card's single "primary" type. */
const TYPE_ORDER = [
  'Land',
  'Creature',
  'Planeswalker',
  'Battle',
  'Instant',
  'Sorcery',
  'Artifact',
  'Enchantment'
] as const

/** The primary card type from a type line, or null when unknown. */
export function primaryType(typeLine: string | undefined): string | null {
  if (!typeLine) return null
  for (const type of TYPE_ORDER) {
    if (typeLine.includes(type)) return type
  }
  return 'Other'
}

const COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G']

/** Aggregates mana curve, colour, type, and value statistics for a deck. */
export function computeDeckStats(items: DeckStatsInput[]): DeckStats {
  const stats: DeckStats = {
    total: 0,
    lands: 0,
    curve: [0, 0, 0, 0, 0, 0, 0, 0],
    colors: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    types: {},
    value: 0
  }

  for (const { card, count } of items) {
    if (count <= 0) continue
    stats.total += count
    stats.value += (bestUsd(card.prices) ?? 0) * count

    const type = primaryType(card.typeLine)
    if (type) stats.types[type] = (stats.types[type] ?? 0) + count

    if (card.typeLine?.includes('Land')) {
      stats.lands += count
      continue
    }

    const cmc = Math.min(7, Math.max(0, Math.round(card.cmc ?? 0)))
    stats.curve[cmc]! += count

    const colors = (card.colors ?? []).filter((c): c is ManaColor =>
      (COLORS as string[]).includes(c)
    )
    if (colors.length === 0) stats.colors.C += count
    else for (const color of colors) stats.colors[color] += count
  }

  return stats
}
