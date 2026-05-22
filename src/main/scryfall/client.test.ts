import { describe, expect, it, vi } from 'vitest'
import { RateLimiter } from './rate-limiter'
import { ScryfallClient, ScryfallError } from './client'

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  })
}

/** A client with no real delays: zero-interval limiter and instant sleep. */
function makeClient(fetchFn: typeof fetch, maxRetries = 2): ScryfallClient {
  return new ScryfallClient({
    userAgent: 'PhoxxPhireProxy/test',
    limiter: new RateLimiter(0),
    sleepFn: async () => {},
    maxRetries,
    fetchFn
  })
}

const rawCard = {
  id: 'id-1',
  oracle_id: 'o-1',
  name: 'Lightning Bolt',
  set: 'lea',
  collector_number: '161',
  lang: 'en',
  layout: 'normal',
  image_uris: { png: 'https://img/bolt.png' }
}

describe('ScryfallClient', () => {
  it('sends the required User-Agent and Accept headers', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ object: 'list', has_more: false, data: [] })
    )
    await makeClient(fetchFn).search('bolt')

    const [url, init] = fetchFn.mock.calls[0]!
    expect(String(url)).toContain('/cards/search')
    expect(String(url)).toContain('q=bolt')
    const headers = init?.headers as Record<string, string>
    expect(headers['User-Agent']).toBe('PhoxxPhireProxy/test')
    expect(headers.Accept).toContain('application/json')
  })

  it('normalizes search results and drops faceless cards', async () => {
    const faceless = { ...rawCard, id: 'id-2', image_uris: undefined }
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ object: 'list', total_cards: 2, has_more: true, data: [rawCard, faceless] })
    )
    const result = await makeClient(fetchFn).search('bolt')
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.id).toBe('id-1')
    expect(result.totalCards).toBe(2)
    expect(result.hasMore).toBe(true)
  })

  it('maps a 404 search (no matches) to an empty result', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ object: 'error' }, { status: 404 })
    )
    const result = await makeClient(fetchFn).search('asdfghjkl')
    expect(result).toEqual({ cards: [], totalCards: 0, hasMore: false })
  })

  it('retries on HTTP 429 and then succeeds', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ object: 'list', has_more: false, data: [rawCard] }))
    const result = await makeClient(fetchFn).search('bolt')
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(result.cards).toHaveLength(1)
  })

  it('retries a network error then resolves', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse(rawCard))
    const card = await makeClient(fetchFn).getById('id-1')
    expect(card.name).toBe('Lightning Bolt')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('throws a ScryfallError for non-retryable failures', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('nope', { status: 422 }))
    await expect(makeClient(fetchFn).getById('bad')).rejects.toBeInstanceOf(ScryfallError)
  })

  it('returns autocomplete suggestions and short-circuits empty queries', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({ data: ['Bolt', 'Boltography'] }))
    const client = makeClient(fetchFn)
    expect(await client.autocomplete('bol')).toEqual(['Bolt', 'Boltography'])
    expect(await client.autocomplete('   ')).toEqual([])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('returns no suggestions (never throws) when autocomplete fails', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }))
    await expect(makeClient(fetchFn, 0).autocomplete('bolt')).resolves.toEqual([])
  })

  it('builds a fuzzy named lookup by default', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(rawCard))
    await makeClient(fetchFn).named('lightning bolt')
    expect(String(fetchFn.mock.calls[0]![0])).toContain('fuzzy=lightning')
  })

  it('builds an exact named lookup when requested', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(rawCard))
    await makeClient(fetchFn).named('Lightning Bolt', true)
    const url = String(fetchFn.mock.calls[0]![0])
    expect(url).toContain('exact=Lightning')
    expect(url).not.toContain('fuzzy=')
  })

  it('honours a Retry-After header on 429 before retrying', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('slow down', { status: 429, headers: { 'retry-after': '1' } })
      )
      .mockResolvedValueOnce(jsonResponse(rawCard))
    const card = await makeClient(fetchFn).getById('id-1')
    expect(card.id).toBe('id-1')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('queries all printings by oracle id with unique=prints', async () => {
    const second = { ...rawCard, id: 'id-2', set: 'mh3' }
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({ object: 'list', has_more: false, data: [rawCard, second] })
    )
    const cards = await makeClient(fetchFn).getPrintings('o-1')
    const url = String(fetchFn.mock.calls[0]![0])
    expect(url).toContain('oracleid%3Ao-1')
    expect(url).toContain('unique=prints')
    expect(cards.map((card) => card.id)).toEqual(['id-1', 'id-2'])
  })

  it('returns no printings for a missing oracle id without calling the API', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(rawCard))
    expect(await makeClient(fetchFn).getPrintings('')).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('looks up a printing by lower-cased set code and collector number', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(rawCard))
    await makeClient(fetchFn).getBySetAndNumber('M21', '159')
    expect(String(fetchFn.mock.calls[0]![0])).toContain('/cards/m21/159')
  })
})
