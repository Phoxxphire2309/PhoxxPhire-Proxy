import { describe, expect, it } from 'vitest'
import { buildLibrary, shuffle, type LibraryCard } from './sampleHand'

describe('buildLibrary', () => {
  it('expands each source into one entry per copy', () => {
    const library = buildLibrary([
      { cardId: 'a', name: 'Plains', copies: 3 },
      { cardId: 'b', name: 'Sol Ring', copies: 1 },
      { cardId: 'c', name: 'Zero', copies: 0 }
    ])
    expect(library).toHaveLength(4)
    expect(library.filter((c) => c.cardId === 'a')).toHaveLength(3)
    expect(library.some((c) => c.cardId === 'c')).toBe(false)
  })
})

describe('shuffle', () => {
  const deck: LibraryCard[] = Array.from({ length: 6 }, (_u, i) => ({
    cardId: String(i),
    name: String(i)
  }))

  it('returns a permutation of the same cards without mutating the input', () => {
    const original = [...deck]
    const result = shuffle(deck, () => 0.5)
    expect(result).toHaveLength(deck.length)
    expect([...result].sort((a, b) => a.cardId.localeCompare(b.cardId))).toEqual(
      [...deck].sort((a, b) => a.cardId.localeCompare(b.cardId))
    )
    expect(deck).toEqual(original) // input untouched
  })

  it('is deterministic for a fixed rng', () => {
    const rng = (): number => 0 // always swaps with index 0
    expect(shuffle(deck, rng)).toEqual(shuffle(deck, rng))
  })

  it('handles empty and single-element inputs', () => {
    expect(shuffle([])).toEqual([])
    expect(shuffle([{ cardId: 'x', name: 'x' }])).toEqual([{ cardId: 'x', name: 'x' }])
  })
})
