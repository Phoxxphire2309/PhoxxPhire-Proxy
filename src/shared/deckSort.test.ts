import { describe, expect, it } from 'vitest'
import type { Card } from './scryfall'
import { sortDeckItems } from './deckSort'

const card = (over: Partial<Card>): Card => ({
  id: over.id ?? 'id',
  oracleId: 'o',
  name: over.name ?? 'Card',
  setCode: 'tst',
  collectorNumber: '1',
  lang: 'en',
  layout: 'normal',
  faces: [{ name: over.name ?? 'Card', imageUrl: 'x' }],
  prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
  relatedTokens: [],
  ...over
})

const entry = (over: Partial<Card>): { card: Card } => ({ card: card(over) })

const names = (items: { card: Card }[]): string[] => items.map((item) => item.card.name)

describe('sortDeckItems', () => {
  const items = [
    entry({ name: 'Bolt', cmc: 1, prices: priced('1.00') }),
    entry({ name: 'Ancestral', cmc: 1, prices: priced('100.00') }),
    entry({ name: 'Colossus', cmc: 8, prices: priced('0.25') })
  ]

  function priced(usd: string): Card['prices'] {
    return { usd: Number(usd), usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null }
  }

  it('returns the input unchanged for manual order', () => {
    expect(sortDeckItems(items, 'manual')).toBe(items)
  })

  it('sorts by name A→Z and Z→A', () => {
    expect(names(sortDeckItems(items, 'name-asc'))).toEqual(['Ancestral', 'Bolt', 'Colossus'])
    expect(names(sortDeckItems(items, 'name-desc'))).toEqual(['Colossus', 'Bolt', 'Ancestral'])
  })

  it('sorts by mana value, breaking ties by name', () => {
    expect(names(sortDeckItems(items, 'cmc-asc'))).toEqual(['Ancestral', 'Bolt', 'Colossus'])
    expect(names(sortDeckItems(items, 'cmc-desc'))).toEqual(['Colossus', 'Ancestral', 'Bolt'])
  })

  it('sorts by price high→low and low→high', () => {
    expect(names(sortDeckItems(items, 'price-desc'))).toEqual(['Ancestral', 'Bolt', 'Colossus'])
    expect(names(sortDeckItems(items, 'price-asc'))).toEqual(['Colossus', 'Bolt', 'Ancestral'])
  })

  it('does not mutate the input array', () => {
    const before = names(items)
    sortDeckItems(items, 'name-desc')
    expect(names(items)).toEqual(before)
  })
})
