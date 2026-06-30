import { describe, expect, it, vi } from 'vitest'
import { mpcfillCardType } from '@shared/mpcfill'
import { RateLimiter } from '../scryfall/rate-limiter'
import { MpcfillClient, MpcfillError } from './client'

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  })
}

function makeClient(fetchFn: typeof fetch, maxRetries = 2): MpcfillClient {
  return new MpcfillClient({
    userAgent: 'PhoxxPhireProxy/test',
    limiter: new RateLimiter(0),
    sleepFn: async () => {},
    maxRetries,
    fetchFn
  })
}

/** Routes the three calls (sources, editorSearch, cards) to canned responses. */
function routedFetch(handlers: {
  sources: unknown
  editorSearch: unknown
  cards: unknown
}): typeof fetch {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url.includes('/2/sources/')) return jsonResponse(handlers.sources)
    if (url.includes('/2/editorSearch/')) return jsonResponse(handlers.editorSearch)
    if (url.includes('/2/cards/')) return jsonResponse(handlers.cards)
    throw new Error(`unexpected url ${url}`)
  })
}

describe('MpcfillClient', () => {
  it('searches, resolves identifiers, and preserves ranking order', async () => {
    const fetchFn = routedFetch({
      sources: { results: { '1': { name: 'A' }, '2': { name: 'B' } } },
      editorSearch: { results: { 'Sol Ring': { CARD: ['drive-b', 'drive-a'] } } },
      cards: {
        results: {
          'drive-a': { identifier: 'drive-a', name: 'Sol Ring (A)', sourceName: 'A', dpi: 800, extension: 'png' },
          'drive-b': { identifier: 'drive-b', name: 'Sol Ring (B)', sourceName: 'B', dpi: 1200, extension: 'jpg' }
        }
      }
    })

    const images = await makeClient(fetchFn).searchImages('Sol Ring')

    // editorSearch order is ['drive-b', 'drive-a'] — that order must be kept.
    expect(images.map((i) => i.identifier)).toEqual(['drive-b', 'drive-a'])
    expect(images[0]).toEqual({
      identifier: 'drive-b',
      name: 'Sol Ring (B)',
      source: 'B',
      dpi: 1200,
      extension: 'jpg'
    })
  })

  it('builds editorSearch from the available source pks', async () => {
    const fetchFn = routedFetch({
      sources: { results: { '1': {}, '3': {} } },
      editorSearch: { results: { x: { CARD: [] } } },
      cards: { results: {} }
    })
    await makeClient(fetchFn).searchImages('whatever')

    const editorCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/2/editorSearch/')
    )!
    const body = JSON.parse((editorCall[1] as RequestInit).body as string)
    expect(body.searchSettings.sourceSettings.sources).toEqual([
      [1, true],
      [3, true]
    ])
    expect(body.queries).toEqual([{ query: 'whatever', cardType: 'CARD' }])
  })

  it('searches the TOKEN index for tokens (so "Blood" finds token art, not cards)', async () => {
    const fetchFn = routedFetch({
      sources: { results: { '1': {} } },
      // MPCFill returns token ids under the TOKEN bucket, not CARD.
      editorSearch: { results: { Blood: { CARD: ['a-card'], TOKEN: ['a-token'] } } },
      cards: { results: { 'a-token': { identifier: 'a-token', name: 'Blood (Token)', sourceName: 'X', dpi: 1200, extension: 'png' } } }
    })

    const images = await makeClient(fetchFn).searchImages('Blood', 'TOKEN')

    expect(images.map((i) => i.identifier)).toEqual(['a-token'])
    const editorCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/2/editorSearch/')
    )!
    expect(JSON.parse((editorCall[1] as RequestInit).body as string).queries).toEqual([
      { query: 'Blood', cardType: 'TOKEN' }
    ])
  })

  it('classifies tokens/emblems vs cards', () => {
    expect(mpcfillCardType({ layout: 'token', typeLine: 'Token Artifact — Blood' })).toBe('TOKEN')
    expect(mpcfillCardType({ layout: 'double_faced_token' })).toBe('TOKEN')
    expect(mpcfillCardType({ layout: 'emblem', typeLine: 'Emblem' })).toBe('TOKEN')
    expect(mpcfillCardType({ layout: 'normal', typeLine: 'Artifact' })).toBe('CARD')
  })

  it('returns nothing for a blank query without hitting the network', async () => {
    const fetchFn = vi.fn<typeof fetch>()
    expect(await makeClient(fetchFn).searchImages('   ')).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('retries on HTTP 429 then surfaces a terminal error', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({}, { status: 429 }))
    await expect(makeClient(fetchFn, 1).searchImages('bolt')).rejects.toBeInstanceOf(MpcfillError)
    // sources call: initial + 1 retry = 2 attempts.
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
