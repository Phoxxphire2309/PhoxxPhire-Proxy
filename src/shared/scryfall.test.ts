import { describe, expect, it } from 'vitest'
import { bestUsd, faceImageUrl, formatUsd, IMAGE_PROTOCOL, type CardPrices } from '@shared/scryfall'

const prices = (overrides: Partial<CardPrices> = {}): CardPrices => ({
  usd: null,
  usdFoil: null,
  usdEtched: null,
  eur: null,
  eurFoil: null,
  tix: null,
  ...overrides
})

describe('faceImageUrl', () => {
  it('defaults to the upscaled quality', () => {
    expect(faceImageUrl('abc-123', 0)).toBe(`${IMAGE_PROTOCOL}://card/abc-123/0/upscaled`)
    expect(faceImageUrl('abc-123', 1)).toBe(`${IMAGE_PROTOCOL}://card/abc-123/1/upscaled`)
  })

  it('supports requesting the source quality', () => {
    expect(faceImageUrl('abc-123', 0, 'source')).toBe(`${IMAGE_PROTOCOL}://card/abc-123/0/source`)
  })

  it('encodes ids that contain URL-significant characters', () => {
    expect(faceImageUrl('a/b c', 0)).toBe(`${IMAGE_PROTOCOL}://card/a%2Fb%20c/0/upscaled`)
  })
})

describe('formatUsd', () => {
  it('formats a number to two decimals with a leading $', () => {
    expect(formatUsd(1.5)).toBe('$1.50')
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('shows an em dash for an unknown price', () => {
    expect(formatUsd(null)).toBe('—')
  })
})

describe('bestUsd', () => {
  it('prefers the non-foil price', () => {
    expect(bestUsd(prices({ usd: 1.0, usdFoil: 5.0, usdEtched: 3.0 }))).toBe(1.0)
  })

  it('falls back to etched, then foil', () => {
    expect(bestUsd(prices({ usdEtched: 3.0, usdFoil: 5.0 }))).toBe(3.0)
    expect(bestUsd(prices({ usdFoil: 5.0 }))).toBe(5.0)
  })

  it('returns null when no USD price is available', () => {
    expect(bestUsd(prices())).toBeNull()
  })
})
