import { describe, expect, it } from 'vitest'
import { printingHidden } from '@shared/printingFilters'
import type { Card } from '@shared/scryfall'

function card(overrides: Partial<Card>): Card {
  return {
    id: 'x',
    oracleId: 'o',
    name: 'Test',
    setCode: 'tst',
    collectorNumber: '1',
    lang: 'en',
    layout: 'normal',
    faces: [{ name: 'Test', imageUrl: 'u' }],
    prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
    relatedTokens: [],
    ...overrides
  }
}

describe('printingHidden', () => {
  it('hides nothing when no filters are active', () => {
    expect(printingHidden(card({ borderColor: 'borderless' }), [])).toBe(false)
  })

  it('hides borderless / full-art / textless / oversized by attribute', () => {
    expect(printingHidden(card({ borderColor: 'borderless' }), ['borderless'])).toBe(true)
    expect(printingHidden(card({ fullArt: true }), ['full-art'])).toBe(true)
    expect(printingHidden(card({ textless: true }), ['textless'])).toBe(true)
    expect(printingHidden(card({ oversized: true }), ['oversized'])).toBe(true)
  })

  it('hides funny cards by set type or acorn security stamp', () => {
    expect(printingHidden(card({ setType: 'funny' }), ['funny'])).toBe(true)
    expect(printingHidden(card({ securityStamp: 'acorn' }), ['funny'])).toBe(true)
    expect(printingHidden(card({ setType: 'expansion' }), ['funny'])).toBe(false)
  })

  it('hides digital-only printings (flag or non-paper games)', () => {
    expect(printingHidden(card({ digital: true }), ['digital'])).toBe(true)
    expect(printingHidden(card({ games: ['arena', 'mtgo'] }), ['digital'])).toBe(true)
    expect(printingHidden(card({ games: ['paper', 'mtgo'] }), ['digital'])).toBe(false)
  })

  it('hides anything but a high-res scan under low-res', () => {
    expect(printingHidden(card({ imageStatus: 'lowres' }), ['low-res'])).toBe(true)
    expect(printingHidden(card({ imageStatus: 'highres_scan' }), ['low-res'])).toBe(false)
  })

  it('hides extended-art / showcase via frame effects', () => {
    expect(printingHidden(card({ frameEffects: ['extendedart'] }), ['extended-art'])).toBe(true)
    expect(printingHidden(card({ frameEffects: ['showcase'] }), ['showcase'])).toBe(true)
    expect(printingHidden(card({ frameEffects: ['inverted'] }), ['extended-art'])).toBe(false)
  })

  it('hides cards banned in a chosen format', () => {
    const banned = card({ legalities: { modern: 'banned', commander: 'legal' } })
    expect(printingHidden(banned, ['banned-modern'])).toBe(true)
    expect(printingHidden(banned, ['banned-commander'])).toBe(false)
  })

  it('hides when any one of several active filters matches', () => {
    const c = card({ borderColor: 'black', fullArt: true })
    expect(printingHidden(c, ['borderless', 'full-art'])).toBe(true)
  })
})
