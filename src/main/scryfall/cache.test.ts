import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Card } from '@shared/scryfall'
import { CardCache } from './cache'

const sampleCard: Card = {
  id: 'id-1',
  oracleId: 'o',
  name: 'Test',
  setCode: 'tst',
  collectorNumber: '1',
  lang: 'en',
  layout: 'normal',
  faces: [{ name: 'Test', imageUrl: 'https://img/x.png' }],
  prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null }
}

describe('CardCache size + clear', () => {
  let dir: string
  let cache: CardCache

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-cache-'))
    cache = new CardCache(dir)
    await cache.init()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports zero for an empty cache and grows after writes', async () => {
    expect(await cache.sizeBytes()).toBe(0)
    await cache.putCard(sampleCard)
    await cache.writeImage('id-1', 0, new Uint8Array([1, 2, 3, 4, 5]))
    expect(await cache.sizeBytes()).toBeGreaterThan(0)
  })

  it('clears all cached data back to zero', async () => {
    await cache.putCard(sampleCard)
    await cache.writeImage('id-1', 0, new Uint8Array([1, 2, 3]))
    await cache.clear()
    expect(await cache.sizeBytes()).toBe(0)
    expect(await cache.getCard('id-1')).toBeNull()
  })
})
