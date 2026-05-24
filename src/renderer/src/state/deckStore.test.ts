import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'

const card = (id: string): Card => ({
  id,
  oracleId: 'o',
  name: id,
  setCode: 'tst',
  collectorNumber: '1',
  lang: 'en',
  layout: 'normal',
  faces: [{ name: id, imageUrl: 'x' }],
  prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
  relatedTokens: []
})

const ids = (): string[] => useDeckStore.getState().items.map((item) => item.card.id)

describe('deckStore undo/redo', () => {
  beforeEach(() => {
    // Reset items (records into history), then clear the history stacks.
    useDeckStore.setState({ items: [] })
    useDeckStore.setState({ past: [], future: [] })
  })

  it('undoes and redoes successive edits', () => {
    const { add, undo, redo } = useDeckStore.getState()
    add(card('a'))
    add(card('b'))
    expect(ids()).toEqual(['a', 'b'])

    undo()
    expect(ids()).toEqual(['a'])
    undo()
    expect(ids()).toEqual([])

    redo()
    expect(ids()).toEqual(['a'])
    redo()
    expect(ids()).toEqual(['a', 'b'])
  })

  it('clears the redo stack when a new edit is made after an undo', () => {
    const { add, undo, redo } = useDeckStore.getState()
    add(card('a'))
    add(card('b'))
    undo() // -> [a], future has [a,b]
    add(card('c')) // fresh edit clears redo
    expect(ids()).toEqual(['a', 'c'])
    expect(useDeckStore.getState().future).toHaveLength(0)
    redo() // no-op
    expect(ids()).toEqual(['a', 'c'])
  })

  it('does nothing when there is no history', () => {
    const { undo, redo } = useDeckStore.getState()
    undo()
    redo()
    expect(ids()).toEqual([])
  })
})
