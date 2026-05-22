import { describe, expect, it, vi } from 'vitest'
import { fetchDeckLines } from './deck-sources'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('fetchDeckLines', () => {
  it('rejects unsupported URLs', async () => {
    await expect(fetchDeckLines('https://example.com/deck/1')).rejects.toThrow(/Unsupported/)
  })

  it('maps an Archidekt deck, skipping the maybeboard', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        cards: [
          {
            quantity: 2,
            card: {
              collectorNumber: '161',
              oracleCard: { name: 'Lightning Bolt' },
              edition: { editioncode: 'lea' }
            }
          },
          { quantity: 1, category: 'Maybeboard', card: { oracleCard: { name: 'Counterspell' } } }
        ]
      })
    )
    const lines = await fetchDeckLines('https://archidekt.com/decks/123/my-deck', fetchFn)
    expect(lines).toEqual([
      { quantity: 2, name: 'Lightning Bolt', setCode: 'lea', collectorNumber: '161' }
    ])
    expect(String(fetchFn.mock.calls[0]![0])).toContain('/api/decks/123/')
  })

  it('maps a Moxfield deck across mainboard and commanders', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        boards: {
          mainboard: {
            cards: { a: { quantity: 4, card: { name: 'Brainstorm', set: 'mh3', cn: '12' } } }
          },
          commanders: {
            cards: { b: { quantity: 1, card: { name: 'Talrand, Sky Summoner' } } }
          }
        }
      })
    )
    const lines = await fetchDeckLines('https://www.moxfield.com/decks/abcDEF123', fetchFn)
    expect(lines).toEqual([
      { quantity: 4, name: 'Brainstorm', setCode: 'mh3', collectorNumber: '12' },
      { quantity: 1, name: 'Talrand, Sky Summoner' }
    ])
  })

  it('surfaces a helpful error when Moxfield blocks the request', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({}, 403))
    await expect(fetchDeckLines('https://www.moxfield.com/decks/blocked', fetchFn)).rejects.toThrow(
      /restricted/
    )
  })
})
