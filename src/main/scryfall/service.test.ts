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
