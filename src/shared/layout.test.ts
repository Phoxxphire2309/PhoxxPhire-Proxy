import { describe, expect, it } from 'vitest'
import {
  computePageLayout,
  DEFAULT_EXPORT_OPTIONS,
  pageCountFor,
  pageDimensionsPt,
  type ExportOptions
} from '@shared/layout'

const base: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, bleedMm: 0, marginMm: 6 }

describe('pageDimensionsPt', () => {
  it('returns portrait dimensions for named sizes', () => {
    expect(pageDimensionsPt({ ...base, pageSize: 'a4' }).width).toBeCloseTo(595.28, 1)
    expect(pageDimensionsPt({ ...base, pageSize: 'legal' }).height).toBeCloseTo(1008, 0)
  })

  it('swaps width and height in landscape', () => {
    const portrait = pageDimensionsPt({ ...base, pageSize: 'a4', orientation: 'portrait' })
    const landscape = pageDimensionsPt({ ...base, pageSize: 'a4', orientation: 'landscape' })
    expect(landscape.width).toBeCloseTo(portrait.height, 5)
    expect(landscape.height).toBeCloseTo(portrait.width, 5)
  })

  it('honours custom millimetre dimensions', () => {
    const dims = pageDimensionsPt({
      ...base,
      pageSize: 'custom',
      customWidthMm: 100,
      customHeightMm: 150
    })
    expect(dims.width).toBeCloseTo(283.46, 1) // 100mm
    expect(dims.height).toBeCloseTo(425.2, 1) // 150mm
  })
})

describe('computePageLayout', () => {
  it('fits a 3×3 grid of cards on an A4 page', () => {
    const layout = computePageLayout(base)
    expect(layout.columns).toBe(3)
    expect(layout.rows).toBe(3)
    expect(layout.perPage).toBe(9)
    expect(layout.slots).toHaveLength(9)
  })

  it('insets the cut rectangle from the bleed footprint by the bleed amount', () => {
    const layout = computePageLayout({ ...base, bleedMm: 3 })
    const slot = layout.slots[0]!
    // 3mm ≈ 8.5pt inset on each side.
    expect(slot.cut.x - slot.bleed.x).toBeCloseTo(8.5, 1)
    expect(slot.bleed.width - slot.cut.width).toBeCloseTo(17.0, 1)
  })

  it('keeps cut rectangles at the standard card size regardless of bleed', () => {
    const layout = computePageLayout({ ...base, bleedMm: 2 })
    const slot = layout.slots[0]!
    // 63mm ≈ 178.6pt, 88mm ≈ 249.4pt.
    expect(slot.cut.width).toBeCloseTo(178.6, 1)
    expect(slot.cut.height).toBeCloseTo(249.4, 1)
  })

  it('returns no slots when the page is too small for a card', () => {
    const layout = computePageLayout({ ...base, marginMm: 140 })
    expect(layout.perPage).toBe(0)
    expect(layout.slots).toHaveLength(0)
  })

  it('scales the printed card size by scalePercent', () => {
    const normal = computePageLayout(base).slots[0]!
    const bigger = computePageLayout({ ...base, scalePercent: 110 }).slots[0]!
    expect(bigger.cut.width).toBeCloseTo(normal.cut.width * 1.1, 1)
    expect(bigger.cut.height).toBeCloseTo(normal.cut.height * 1.1, 1)
  })

  it('treats a non-positive scalePercent as 100%', () => {
    const normal = computePageLayout(base).slots[0]!
    const zero = computePageLayout({ ...base, scalePercent: 0 }).slots[0]!
    expect(zero.cut.width).toBeCloseTo(normal.cut.width, 5)
  })
})

describe('pageCountFor', () => {
  it('rounds up partial pages', () => {
    expect(pageCountFor(9, 9)).toBe(1)
    expect(pageCountFor(10, 9)).toBe(2)
    expect(pageCountFor(0, 9)).toBe(0)
  })

  it('returns zero when nothing fits per page', () => {
    expect(pageCountFor(5, 0)).toBe(0)
  })
})
