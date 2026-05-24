import { describe, expect, it } from 'vitest'
import { computeDeckStats, primaryType, type DeckStatsInput } from '@shared/deckStats'
import type { Card, CardPrices } from '@shared/scryfall'

const prices = (usd: number | null): CardPrices => ({
  usd,
  usdFoil: null,
  usdEtched: null,
  eur: null,
  eurFoil: null,
  tix: null
})

const card = (over: Partial<Card>): Card => ({
  id: over.id ?? 'x',
  oracleId: 'o',
  name: over.name ?? 'Card',
  setCode: 'tst',
  collectorNumber: '1',
  lang: 'en',
  layout: 'normal',
  faces: [{ name: 'Card', imageUrl: 'x' }],
  prices: over.prices ?? prices(null),
  relatedTokens: [],
  ...over
})

describe('primaryType', () => {
  it('picks land first, then creature, over later types', () => {
    expect(primaryType('Legendary Creature — Goblin')).toBe('Creature')
    expect(primaryType('Artifact Creature — Golem')).toBe('Creature')
    expect(primaryType('Basic Land — Mountain')).toBe('Land')
    expect(primaryType('Instant')).toBe('Instant')
  })

  it('returns Other for unrecognised lines and null when absent', () => {
    expect(primaryType('Conspiracy')).toBe('Other')
    expect(primaryType(undefined)).toBeNull()
  })
})

describe('computeDeckStats', () => {
  const items: DeckStatsInput[] = [
    { card: card({ id: 'a', typeLine: 'Creature — Elf', cmc: 2, colors: ['G'] }), count: 4 },
    { card: card({ id: 'b', typeLine: 'Instant', cmc: 1, colors: ['U', 'R'] }), count: 2 },
    { card: card({ id: 'c', typeLine: 'Basic Land — Mountain', cmc: 0, colors: [] }), count: 10 },
    {
      card: card({ id: 'd', typeLine: 'Artifact', cmc: 9, colors: [], prices: prices(5) }),
      count: 1
    }
  ]
  const stats = computeDeckStats(items)

  it('totals copies and counts lands separately', () => {
    expect(stats.total).toBe(17)
    expect(stats.lands).toBe(10)
  })

  it('builds a non-land mana curve, bucketing 7+', () => {
    expect(stats.curve[2]).toBe(4) // the elf
    expect(stats.curve[1]).toBe(2) // the instant
    expect(stats.curve[7]).toBe(1) // the cmc-9 artifact lands in the 7+ bucket
    expect(stats.curve[0]).toBe(0) // the land is excluded
  })

  it('counts each colour, multicolour cards in every colour, colourless non-lands as C', () => {
    expect(stats.colors.G).toBe(4)
    expect(stats.colors.U).toBe(2)
    expect(stats.colors.R).toBe(2)
    expect(stats.colors.C).toBe(1) // the colourless artifact
  })

  it('counts primary types and sums value', () => {
    expect(stats.types.Creature).toBe(4)
    expect(stats.types.Land).toBe(10)
    expect(stats.types.Artifact).toBe(1)
    expect(stats.value).toBe(5)
  })

  it('ignores zero-count entries', () => {
    const empty = computeDeckStats([{ card: card({ typeLine: 'Instant', cmc: 1 }), count: 0 }])
    expect(empty.total).toBe(0)
  })
})
