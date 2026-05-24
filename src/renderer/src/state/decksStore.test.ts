import { beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'
import { useDecksStore } from '@renderer/state/decksStore'

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

const activeIds = (): string[] => useDeckStore.getState().items.map((item) => item.card.id)

describe('decksStore', () => {
  beforeEach(() => {
    // Restore to a single empty tab.
    useDecksStore.getState().restore([{ id: 't1', name: 'Deck 1', items: [] }], 't1')
  })

  it('keeps each tab’s cards separate when switching', () => {
    useDeckStore.getState().add(card('a'))
    useDecksStore.getState().newTab()
    expect(activeIds()).toEqual([]) // fresh tab is empty
    useDeckStore.getState().add(card('b'))
    expect(activeIds()).toEqual(['b'])

    const [first, second] = useDecksStore.getState().tabs
    useDecksStore.getState().switchTab(first!.id)
    expect(activeIds()).toEqual(['a']) // first tab preserved
    useDecksStore.getState().switchTab(second!.id)
    expect(activeIds()).toEqual(['b'])
  })

  it('closing the active tab switches to a neighbour', () => {
    useDeckStore.getState().add(card('a'))
    useDecksStore.getState().newTab()
    useDeckStore.getState().add(card('b'))
    const tabs = useDecksStore.getState().tabs
    expect(tabs).toHaveLength(2)

    useDecksStore.getState().closeTab(tabs[1]!.id) // close active (Deck 2)
    expect(useDecksStore.getState().tabs).toHaveLength(1)
    expect(activeIds()).toEqual(['a']) // fell back to Deck 1
  })

  it('empties (never removes) the final tab on close', () => {
    useDeckStore.getState().add(card('a'))
    const only = useDecksStore.getState().tabs[0]!
    useDecksStore.getState().closeTab(only.id)
    expect(useDecksStore.getState().tabs).toHaveLength(1)
    expect(activeIds()).toEqual([])
  })

  it('renames a tab, ignoring blank names', () => {
    const id = useDecksStore.getState().tabs[0]!.id
    useDecksStore.getState().renameTab(id, 'Aggro')
    expect(useDecksStore.getState().tabs[0]!.name).toBe('Aggro')
    useDecksStore.getState().renameTab(id, '   ')
    expect(useDecksStore.getState().tabs[0]!.name).toBe('Aggro')
  })
})
