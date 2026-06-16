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

describe('ScryfallService.resolveDeck removeBasics', () => {
  let dir: string
  let service: ScryfallService

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-basics-'))
    const cache = new CardCache(dir)
    await cache.init()
    const fetchFn = (async (input: string | URL) => {
      const url = String(input)
      if (url.includes('/cards/named') && url.includes('Lightning')) {
        return jsonResponse(card('bolt', 'lea', '161'))
      }
      if (url.includes('/cards/named') && url.includes('Forest')) {
        return jsonResponse({
          ...card('forest', 'lea', '294', 'Forest'),
          type_line: 'Basic Land — Forest'
        })
      }
      if (url.includes('/cards/named') && url.includes('Snow')) {
        return jsonResponse({
          ...card('snow', 'khm', '278', 'Snow-Covered Forest'),
          type_line: 'Basic Snow Land — Forest'
        })
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

  it('drops basic lands (incl. snow basics) when removeBasics is set, keeps the rest', async () => {
    const text = ['4 Lightning Bolt', '10 Forest', '5 Snow-Covered Forest'].join('\n')
    const result = await service.resolveDeck(text, undefined, false, true)
    expect(result.items.map((item) => item.card.id)).toEqual(['bolt'])
    expect(result.errors).toHaveLength(0)
  })

  it('keeps basic lands when removeBasics is not set', async () => {
    const result = await service.resolveDeck('10 Forest', undefined, false, false)
    expect(result.items.map((item) => item.card.id)).toEqual(['forest'])
  })
})

describe('ScryfallService.resolveDeck language', () => {
  let dir: string
  let service: ScryfallService

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-lang-'))
    const cache = new CardCache(dir)
    await cache.init()
    const fetchFn = (async (input: string | URL) => {
      const url = String(input)
      // English resolution by name → a known printing (lea/161).
      if (url.includes('/cards/named') && url.includes('Lightning')) {
        return jsonResponse(card('bolt-en', 'lea', '161'))
      }
      // German localisation of that exact printing exists.
      if (url.includes('/cards/lea/161/de')) {
        return jsonResponse({ ...card('bolt-de', 'lea', '161', 'Blitzschlag'), lang: 'de' })
      }
      // No French localisation → 404.
      if (url.includes('/cards/lea/161/fr')) {
        return jsonResponse({ object: 'error', status: 404 }, 404)
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

  it('swaps to the localised printing when it exists', async () => {
    const result = await service.resolveDeck('1 Lightning Bolt', undefined, false, false, 'de')
    expect(result.items[0]?.card.id).toBe('bolt-de')
    expect(result.items[0]?.card.lang).toBe('de')
  })

  it('keeps the English printing when no localisation exists', async () => {
    const result = await service.resolveDeck('1 Lightning Bolt', undefined, false, false, 'fr')
    expect(result.items[0]?.card.id).toBe('bolt-en')
    expect(result.errors).toHaveLength(0)
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

describe('ScryfallService.getPrintings', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-prints-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('caches printings in memory so a repeat lookup makes no second request', async () => {
    const cache = new CardCache(dir)
    await cache.init()
    let calls = 0
    const fetchFn = (async () => {
      calls += 1
      return jsonResponse({
        object: 'list',
        has_more: false,
        data: [card('a', 'lea', '1'), card('b', 'mh3', '2')]
      })
    }) as typeof fetch
    const client = new ScryfallClient({
      userAgent: 'test',
      limiter: new RateLimiter(0),
      sleepFn: async () => {},
      maxRetries: 0,
      fetchFn
    })
    const service = new ScryfallService(client, cache)

    const first = await service.getPrintings('o-1')
    const second = await service.getPrintings('o-1')
    expect(first.map((c) => c.id)).toEqual(['a', 'b'])
    expect(second).toBe(first) // same cached array, no refetch
    expect(calls).toBe(1)
    // Every printing was still persisted to the on-disk card cache.
    expect((await cache.getCard('a'))?.id).toBe('a')
    expect((await cache.getCard('b'))?.id).toBe('b')
  })
})
