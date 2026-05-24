import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CardCache } from './cache'
import { RateLimiter } from './rate-limiter'
import { ScryfallClient } from './client'
import { ScryfallService } from './service'

function card(id: string, set: string, number: string, name = 'Lightning Bolt') {
  return {
    id,
    oracle_id: 'o-1',
    name,
    set,
    collector_number: number,
    lang: 'en',
    layout: 'normal',
    image_uris: { png: `https://img/${id}.png` }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

/** Routes requests by URL so we can exercise deck resolution end to end. */
function routedFetch(): typeof fetch {
  return (async (input: string | URL) => {
    const url = String(input)
    if (url.includes('/cards/named') && url.includes('Lightning')) {
      return jsonResponse(card('bolt', 'lea', '161'))
    }
    if (url.includes('/cards/c21/263')) {
      return jsonResponse(card('solring', 'c21', '263', 'Sol Ring'))
    }
    return jsonResponse({ object: 'error', status: 404 }, 404)
  }) as typeof fetch
}

describe('ScryfallService.resolveDeck', () => {
  let dir: string
  let service: ScryfallService

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-deck-'))
    const cache = new CardCache(dir)
    await cache.init()
    const client = new ScryfallClient({
      userAgent: 'test',
      limiter: new RateLimiter(0),
      sleepFn: async () => {},
      maxRetries: 0,
      fetchFn: routedFetch()
    })
    service = new ScryfallService(client, cache)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('merges duplicate cards by quantity and collects unresolved lines', async () => {
    const text = [
      '2 Lightning Bolt',
      '1 Lightning Bolt',
      '1 Sol Ring (C21) 263',
      '3 Notacard'
    ].join('\n')
    const result = await service.resolveDeck(text)

    const bolt = result.items.find((item) => item.card.id === 'bolt')
    const solRing = result.items.find((item) => item.card.id === 'solring')
    expect(bolt?.quantity).toBe(3)
    expect(solRing?.quantity).toBe(1)
    expect(result.items).toHaveLength(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Notacard')
  })

  it('returns an empty result for an empty list', async () => {
    expect(await service.resolveDeck('   \n\n')).toEqual({ items: [], errors: [] })
  })
})

describe('ScryfallService.resolveDeck excludeFoils', () => {
  let dir: string
  let service: ScryfallService

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-foil-'))
    const cache = new CardCache(dir)
    await cache.init()
    // A foil-only card resolved by name; its oracle has a non-foil printing too.
    const foilCard = { ...card('foilonly', 'pls', '1', 'Shiny'), finishes: ['foil'] }
    const nonFoilCard = { ...card('regular', 'lea', '9', 'Shiny'), finishes: ['nonfoil', 'foil'] }
    const fetchFn = (async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/cards/named') && url.includes('Shiny')) return jsonResponse(foilCard)
      if (url.includes('/cards/search')) {
        return jsonResponse({ object: 'list', has_more: false, data: [foilCard, nonFoilCard] })
      }
      return jsonResponse({ object: 'error', status: 404 }, 404)
    }) as typeof fetch
    const client = new ScryfallClient({
      userAgent: 'test',
      limiter: new RateLimiter(0),
      sleepFn: async () => {},
      maxRetries: 0,
      fetchFn
    })
    service = new ScryfallService(client, cache)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps the foil-only printing when excludeFoils is off', async () => {
    const result = await service.resolveDeck('1 Shiny')
    expect(result.items[0]?.card.id).toBe('foilonly')
  })

  it('swaps a foil-only card for a non-foil printing when excludeFoils is on', async () => {
    const result = await service.resolveDeck('1 Shiny', undefined, true)
    expect(result.items[0]?.card.id).toBe('regular')
  })
})

describe('ScryfallService.findTokens', () => {
  let dir: string
  let service: ScryfallService
  let cache: CardCache

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-tokens-'))
    cache = new CardCache(dir)
    await cache.init()
    const tokenFetch = (async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/cards/tok-goblin')) {
        return jsonResponse(card('tok-goblin', 'tlea', 't1', 'Goblin'))
      }
      return jsonResponse({ object: 'error', status: 404 }, 404)
    }) as typeof fetch
    const client = new ScryfallClient({
      userAgent: 'test',
      limiter: new RateLimiter(0),
      sleepFn: async () => {},
      maxRetries: 0,
      fetchFn: tokenFetch
    })
    service = new ScryfallService(client, cache)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the distinct tokens created by the given deck cards', async () => {
    await cache.putCard({
      id: 'krenko',
      oracleId: 'o-krenko',
      name: 'Krenko, Mob Boss',
      setCode: 'lea',
      collectorNumber: '1',
      lang: 'en',
      layout: 'normal',
      faces: [{ name: 'Krenko, Mob Boss', imageUrl: 'https://img/krenko.png' }],
      prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
      relatedTokens: [{ id: 'tok-goblin', name: 'Goblin', typeLine: 'Token Creature — Goblin' }]
    })

    const tokens = await service.findTokens(['krenko'])
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.id).toBe('tok-goblin')
    expect(tokens[0]?.name).toBe('Goblin')
  })

  it('skips tokens that are already in the deck', async () => {
    await cache.putCard({
      id: 'krenko',
      oracleId: 'o-krenko',
      name: 'Krenko, Mob Boss',
      setCode: 'lea',
      collectorNumber: '1',
      lang: 'en',
      layout: 'normal',
      faces: [{ name: 'Krenko, Mob Boss', imageUrl: 'https://img/krenko.png' }],
      prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
      relatedTokens: [{ id: 'tok-goblin', name: 'Goblin', typeLine: 'Token Creature — Goblin' }]
    })

    const tokens = await service.findTokens(['krenko', 'tok-goblin'])
    expect(tokens).toEqual([])
  })
})
