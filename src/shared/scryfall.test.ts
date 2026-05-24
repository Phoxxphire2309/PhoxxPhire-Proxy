import { describe, expect, it } from 'vitest'
import {
  bestPrinting,
  bestUsd,
  faceImageUrl,
  formatUsd,
  imageStatusRank,
  isHighRes,
  IMAGE_PROTOCOL,
  type Card,
  type CardPrices,
  type ImageStatus
} from '@shared/scryfall'

const prices = (overrides: Partial<CardPrices> = {}): CardPrices => ({
  usd: null,
  usdFoil: null,
  usdEtched: null,
  eur: null,
  eurFoil: null,
  tix: null,
  ...overrides
})

const card = (id: string, imageStatus?: ImageStatus): Card => ({
  id,
  oracleId: 'o',
  name: id,
  setCode: 'tst',
  collectorNumber: '1',
  lang: 'en',
  layout: 'normal',
  faces: [{ name: id, imageUrl: 'x' }],
  prices: prices(),
  relatedTokens: [],
  ...(imageStatus !== undefined && { imageStatus })
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

describe('imageStatusRank / isHighRes', () => {
  it('ranks highres_scan highest and undefined lowest', () => {
    expect(imageStatusRank('highres_scan')).toBeGreaterThan(imageStatusRank('lowres'))
    expect(imageStatusRank('lowres')).toBeGreaterThan(imageStatusRank('placeholder'))
    expect(imageStatusRank('placeholder')).toBeGreaterThan(imageStatusRank(undefined))
  })

  it('treats only highres_scan as high-res', () => {
    expect(isHighRes({ imageStatus: 'highres_scan' })).toBe(true)
    expect(isHighRes({ imageStatus: 'lowres' })).toBe(false)
    expect(isHighRes({})).toBe(false)
  })
})

describe('bestPrinting', () => {
  it('picks the highest-quality printing', () => {
    const cards = [card('a', 'lowres'), card('b', 'highres_scan'), card('c', 'placeholder')]
    expect(bestPrinting(cards)?.id).toBe('b')
  })

  it('keeps the first on ties', () => {
    const cards = [card('a', 'highres_scan'), card('b', 'highres_scan')]
    expect(bestPrinting(cards)?.id).toBe('a')
  })

  it('returns null for an empty list', () => {
    expect(bestPrinting([])).toBeNull()
  })
})
