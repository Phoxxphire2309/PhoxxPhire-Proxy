import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '@shared/scryfall'
import type { DeckSection } from '@shared/deck'
import { useOrderStore } from '@renderer/state/orderStore'
import type { DeckItem } from '@renderer/state/deckStore'

const card = (id: string, faces = 1): Card => ({
  id,
  oracleId: 'o',
  name: id,
  setCode: 'tst',
  collectorNumber: '1',
  lang: 'en',
  layout: 'normal',
  faces: Array.from({ length: faces }, (_u, i) => ({ name: `${id}-${i}`, imageUrl: 'x' })),
  prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
  relatedTokens: []
})

const item = (id: string, qty: number, section: DeckSection, faces = 1): DeckItem => ({
  card: card(id, faces),
  quantities: Array(faces).fill(qty),
  section
})

describe('orderStore.syncFromDeck', () => {
  beforeEach(() => useOrderStore.setState({ slots: [] }))

  it('expands one slot per copy per face, skipping the maybeboard', () => {
    useOrderStore
      .getState()
      .syncFromDeck([
        item('a', 2, 'main'),
        item('cmd', 1, 'commander'),
        item('sb', 3, 'sideboard'),
        item('maybe', 5, 'maybeboard')
      ])
    const slots = useOrderStore.getState().slots
    const counts = (id: string): number => slots.filter((s) => s.cardId === id).length
    expect(counts('a')).toBe(2)
    expect(counts('cmd')).toBe(1)
    expect(counts('sb')).toBe(3)
    expect(counts('maybe')).toBe(0) // maybeboard never prints
    expect(slots).toHaveLength(6)
  })

  it('expands each face of a double-faced card', () => {
    useOrderStore.getState().syncFromDeck([item('dfc', 2, 'main', 2)])
    const slots = useOrderStore.getState().slots
    expect(slots.filter((s) => s.faceIndex === 0)).toHaveLength(2)
    expect(slots.filter((s) => s.faceIndex === 1)).toHaveLength(2)
  })

  it('keeps spacers across a re-sync when the card set is unchanged', () => {
    const deck = [item('a', 1, 'main')]
    useOrderStore.getState().syncFromDeck(deck)
    useOrderStore.getState().addSpacer()
    expect(useOrderStore.getState().slots).toHaveLength(2)
    // Same cards → spacer preserved.
    useOrderStore.getState().syncFromDeck(deck)
    expect(useOrderStore.getState().slots.filter((s) => s.spacer)).toHaveLength(1)
  })

  it('drops spacers when the card set changes, and removeAt deletes a slot', () => {
    useOrderStore.getState().syncFromDeck([item('a', 1, 'main')])
    useOrderStore.getState().addSpacer()
    useOrderStore.getState().removeAt(0) // remove the card slot
    expect(useOrderStore.getState().slots).toHaveLength(1)
    // Card set changed → rebuild without spacers.
    useOrderStore.getState().syncFromDeck([item('a', 1, 'main'), item('b', 1, 'main')])
    expect(useOrderStore.getState().slots.some((s) => s.spacer)).toBe(false)
    expect(useOrderStore.getState().slots).toHaveLength(2)
  })
})
