import type { Card } from './scryfall'
import { DECK_SECTIONS, DECK_SECTION_LABELS, type DeckSection } from './deck'
import { primaryType } from './deckStats'

/** How to group the deck's cards in the Decks view. */
export const GROUP_OPTIONS = [
  { key: 'none', label: 'No grouping' },
  { key: 'type', label: 'Type' },
  { key: 'color', label: 'Colour' },
  { key: 'rarity', label: 'Rarity' },
  { key: 'cmc', label: 'Mana value' },
  { key: 'section', label: 'Section' }
] as const

export type GroupBy = (typeof GROUP_OPTIONS)[number]['key']

/** A group of deck entries under a heading. */
export interface DeckGroup<T> {
  key: string
  label: string
  items: T[]
}

/** Any deck entry carrying a card and its section. */
interface Groupable {
  card: Card
  section: DeckSection
}

const COLOR_NAMES: Record<string, string> = {
  W: 'White',
  U: 'Blue',
  B: 'Black',
  R: 'Red',
  G: 'Green'
}

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  mythic: 'Mythic',
  special: 'Special',
  bonus: 'Bonus'
}

/**
 * A card's colour codes (WUBRG). Falls back to the colours implied by each
 * face's mana cost when the card carries no top-level `colors` — modal DFCs and
 * other multi-faced cards keep colours per face, which would otherwise make
 * them look colourless.
 */
export function cardColorCodes(card: Card): string[] {
  const declared = (card.colors ?? []).filter((c) => c in COLOR_NAMES)
  if (declared.length > 0) return declared
  const found = new Set<string>()
  for (const face of card.faces) {
    for (const match of (face.manaCost ?? '').matchAll(/\{([^}]+)\}/g)) {
      for (const symbol of match[1]!) if (symbol in COLOR_NAMES) found.add(symbol)
    }
  }
  return [...found]
}

/** A card's colour bucket: a single colour, Multicolour, or Colourless. */
function colorGroup(card: Card): { key: string; label: string } {
  const colors = cardColorCodes(card)
  if (colors.length === 0) return { key: 'z-colorless', label: 'Colourless' }
  if (colors.length > 1) return { key: 'y-multi', label: 'Multicolour' }
  const code = colors[0]!
  return { key: `c-${code}`, label: COLOR_NAMES[code]! }
}

/** Maps each entry to its group key + label for the chosen grouping. */
function classify(item: Groupable, by: GroupBy): { key: string; label: string; sort: number } {
  switch (by) {
    case 'type': {
      const type = primaryType(item.card.typeLine) ?? 'Other'
      const order = [
        'Land',
        'Creature',
        'Planeswalker',
        'Battle',
        'Instant',
        'Sorcery',
        'Artifact',
        'Enchantment',
        'Other'
      ]
      return { key: type, label: type, sort: order.indexOf(type) }
    }
    case 'color': {
      const { key, label } = colorGroup(item.card)
      const order = ['c-W', 'c-U', 'c-B', 'c-R', 'c-G', 'y-multi', 'z-colorless']
      return { key, label, sort: order.indexOf(key) }
    }
    case 'rarity': {
      const rarity = item.card.rarity ?? 'unknown'
      const order = ['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus', 'unknown']
      return { key: rarity, label: RARITY_LABELS[rarity] ?? 'Unknown', sort: order.indexOf(rarity) }
    }
    case 'cmc': {
      const cmc = Math.min(7, Math.max(0, Math.round(item.card.cmc ?? 0)))
      return {
        key: `mv-${cmc}`,
        label: cmc === 7 ? 'Mana value 7+' : `Mana value ${cmc}`,
        sort: cmc
      }
    }
    case 'section':
      return {
        key: item.section,
        label: DECK_SECTION_LABELS[item.section],
        sort: DECK_SECTIONS.indexOf(item.section)
      }
    default:
      return { key: 'all', label: '', sort: 0 }
  }
}

/**
 * Groups deck entries under headings for the chosen grouping, preserving the
 * input order within each group and ordering the groups sensibly (e.g. mana
 * value ascending, colours WUBRG). `none` returns a single unlabelled group.
 */
export function groupDeckItems<T extends Groupable>(items: T[], by: GroupBy): DeckGroup<T>[] {
  if (by === 'none') return items.length ? [{ key: 'all', label: '', items }] : []

  const groups = new Map<string, { label: string; sort: number; items: T[] }>()
  for (const item of items) {
    const { key, label, sort } = classify(item, by)
    const group = groups.get(key) ?? { label, sort, items: [] }
    group.items.push(item)
    groups.set(key, group)
  }

  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, sort: group.sort, items: group.items }))
    .sort((a, b) => {
      // Unknown/Other (sort === -1) fall to the end.
      const sa = a.sort < 0 ? Number.MAX_SAFE_INTEGER : a.sort
      const sb = b.sort < 0 ? Number.MAX_SAFE_INTEGER : b.sort
      return sa - sb || a.label.localeCompare(b.label)
    })
    .map(({ key, label, items: groupItems }) => ({ key, label, items: groupItems }))
}
