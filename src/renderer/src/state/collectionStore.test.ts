import { beforeEach, describe, expect, it } from 'vitest'
import { useCollectionStore } from '@renderer/state/collectionStore'

describe('collectionStore', () => {
  beforeEach(() => {
    useCollectionStore.setState({ owned: {}, skipOwned: false, forcePrint: {} })
  })

  it('imports owned cards by name, ignoring quantities and case', () => {
    const added = useCollectionStore.getState().importOwned('4 Lightning Bolt\nSol Ring')
    expect(added).toBe(2)
    expect(useCollectionStore.getState().isOwned('lightning bolt')).toBe(true)
    expect(useCollectionStore.getState().isOwned('SOL RING')).toBe(true)
    expect(useCollectionStore.getState().isOwned('Counterspell')).toBe(false)
  })

  it('merges across imports and reports the distinct count', () => {
    useCollectionStore.getState().importOwned('Plains')
    useCollectionStore.getState().importOwned('Plains\nIsland')
    expect(useCollectionStore.getState().ownedCount()).toBe(2)
  })

  it('toggles the per-card force-print override', () => {
    const { toggleForce } = useCollectionStore.getState()
    toggleForce('card-1')
    expect(useCollectionStore.getState().forcePrint['card-1']).toBe(true)
    toggleForce('card-1')
    expect(useCollectionStore.getState().forcePrint['card-1']).toBeUndefined()
  })

  it('restores owned names and the skip flag', () => {
    useCollectionStore.getState().restore(['Forest', 'Mountain'], true)
    expect(useCollectionStore.getState().skipOwned).toBe(true)
    expect(useCollectionStore.getState().isOwned('forest')).toBe(true)
    expect(useCollectionStore.getState().ownedCount()).toBe(2)
  })

  it('clears the collection', () => {
    useCollectionStore.getState().importOwned('Island')
    useCollectionStore.getState().clearOwned()
    expect(useCollectionStore.getState().ownedCount()).toBe(0)
  })
})
