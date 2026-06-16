import { describe, expect, it, vi } from 'vitest'
import { fetchDeckLines } from './deck-sources'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } })
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

  it('maps a Cube Cobra list (names only → one of each) via the cubelist API', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      textResponse('Lightning Bolt\nCounterspell\nSol Ring\n')
    )
    const lines = await fetchDeckLines('https://cubecobra.com/cube/overview/my-cube', fetchFn)
    expect(lines).toEqual([
      { quantity: 1, name: 'Lightning Bolt' },
      { quantity: 1, name: 'Counterspell' },
      { quantity: 1, name: 'Sol Ring' }
    ])
    expect(String(fetchFn.mock.calls[0]![0])).toContain('/cube/api/cubelist/my-cube')
  })

  it('maps an MTGGoldfish deck via its plain-text download', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => textResponse('4 Brainstorm\n2 Island\n'))
    const lines = await fetchDeckLines('https://www.mtggoldfish.com/deck/6234567#paper', fetchFn)
    expect(lines).toEqual([
      { quantity: 4, name: 'Brainstorm' },
      { quantity: 2, name: 'Island' }
    ])
    expect(String(fetchFn.mock.calls[0]![0])).toContain('/deck/download/6234567')
  })

  it('maps a TappedOut deck via its ?fmt=txt export', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => textResponse('1 Sol Ring\n1 Arcane Signet\n'))
    const lines = await fetchDeckLines('https://tappedout.net/mtg-decks/my-edh-deck/', fetchFn)
    expect(lines).toEqual([
      { quantity: 1, name: 'Sol Ring' },
      { quantity: 1, name: 'Arcane Signet' }
    ])
    expect(String(fetchFn.mock.calls[0]![0])).toContain('/mtg-decks/my-edh-deck/?fmt=txt')
  })

  it('treats a private/empty text export as a helpful error, not a silent empty deck', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => textResponse('<html>Log in</html>'))
    await expect(
      fetchDeckLines('https://tappedout.net/mtg-decks/private/', fetchFn)
    ).rejects.toThrow(/private or empty/)
  })
})
