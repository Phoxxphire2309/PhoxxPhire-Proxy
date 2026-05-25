import { describe, expect, it } from 'vitest'
import type { Card } from './scryfall'
import type { DeckSection } from './deck'
import { groupDeckItems } from './deckGroup'

const card = (over: Partial<Card>): Card => ({
  id: over.id ?? 'id',
  oracleId: 'o',
  name: over.name ?? 'Card',
  setCode: 'tst',
  collectorNumber: '1',
  lang: 'en',
  layout: 'normal',
  faces: [{ name: 'Card', imageUrl: 'x' }],
  prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
  relatedTokens: [],
  ...over
})

const entry = (
  over: Partial<Card>,
  section: DeckSection = 'main'
): { card: Card; section: DeckSection } => ({
  card: card(over),
  section
})

describe('groupDeckItems', () => {
  it('returns a single unlabelled group for none', () => {
    const items = [entry({ id: 'a' }), entry({ id: 'b' })]
    const groups = groupDeckItems(items, 'none')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.label).toBe('')
    expect(groups[0]!.items).toHaveLength(2)
  })

  it('groups by type in priority order (lands first, other last)', () => {
    const items = [
      entry({ id: 'a', typeLine: 'Instant' }),
      entry({ id: 'b', typeLine: 'Basic Land — Forest' }),
      entry({ id: 'c', typeLine: 'Creature — Elf' })
    ]
    const labels = groupDeckItems(items, 'type').map((g) => g.label)
    expect(labels).toEqual(['Land', 'Creature', 'Instant'])
  })

  it('groups by colour as single / multicolour / colourless, ordered WUBRG…', () => {
    const items = [
      entry({ id: 'a', colors: [] }),
      entry({ id: 'b', colors: ['U'] }),
      entry({ id: 'c', colors: ['W', 'B'] }),
      entry({ id: 'd', colors: ['W'] })
    ]
    const labels = groupDeckItems(items, 'color').map((g) => g.label)
    expect(labels).toEqual(['White', 'Blue', 'Multicolour', 'Colourless'])
  })

  it('groups by mana value ascending with a 7+ bucket', () => {
    const items = [
      entry({ id: 'a', cmc: 9 }),
      entry({ id: 'b', cmc: 1 }),
      entry({ id: 'c', cmc: 3 })
    ]
    const labels = groupDeckItems(items, 'cmc').map((g) => g.label)
    expect(labels).toEqual(['Mana value 1', 'Mana value 3', 'Mana value 7+'])
  })

  it('groups by rarity with unknown last', () => {
    const items = [
      entry({ id: 'a' }), // no rarity → unknown
      entry({ id: 'b', rarity: 'mythic' }),
      entry({ id: 'c', rarity: 'common' })
    ]
    const labels = groupDeckItems(items, 'rarity').map((g) => g.label)
    expect(labels).toEqual(['Common', 'Mythic', 'Unknown'])
  })
})
