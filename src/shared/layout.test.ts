import { describe, expect, it } from 'vitest'
import {
  computePageLayout,
  DEFAULT_EXPORT_OPTIONS,
  defaultPageSizeForRegion,
  pageCountFor,
  pageDimensionsPt,
  type ExportOptions
} from '@shared/layout'
import { mmToPt } from '@shared/units'

const base: ExportOptions = {
  ...DEFAULT_EXPORT_OPTIONS,
  bleedMm: 0,
  marginTopMm: 6,
  marginRightMm: 6,
  marginBottomMm: 6,
  marginLeftMm: 6
}

describe('defaultPageSizeForRegion', () => {
  it('defaults to US Letter in Letter-using countries and A4 elsewhere', () => {
    expect(defaultPageSizeForRegion('US')).toBe('letter')
    expect(defaultPageSizeForRegion('ca')).toBe('letter') // case-insensitive
    expect(defaultPageSizeForRegion('GB')).toBe('a4')
    expect(defaultPageSizeForRegion('DE')).toBe('a4')
    expect(defaultPageSizeForRegion(undefined)).toBe('a4')
  })
})

describe('pageDimensionsPt', () => {
  it('returns portrait dimensions for named sizes', () => {
    expect(pageDimensionsPt({ ...base, pageSize: 'a4' }).width).toBeCloseTo(595.28, 1)
    expect(pageDimensionsPt({ ...base, pageSize: 'legal' }).height).toBeCloseTo(1008, 0)
  })

  it('resolves the added Tabloid and A5 sizes', () => {
    expect(pageDimensionsPt({ ...base, pageSize: 'tabloid' })).toEqual({ width: 792, height: 1224 })
    const a5 = pageDimensionsPt({ ...base, pageSize: 'a5' })
    expect(a5.width).toBeCloseTo(419.53, 1) // 148mm
    expect(a5.height).toBeCloseTo(595.28, 1) // 210mm
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
    const layout = computePageLayout({ ...base, marginLeftMm: 140, marginRightMm: 140 })
    expect(layout.perPage).toBe(0)
    expect(layout.slots).toHaveLength(0)
  })

  it('centres the grid so opposing margins are equal (and duplex backs align)', () => {
    const layout = computePageLayout(base)
    const { width, height } = pageDimensionsPt(base)
    const firstRowEnd = layout.slots[layout.columns - 1]!
    const lastRowStart = layout.slots[(layout.rows - 1) * layout.columns]!
    // Left gap == right gap, and top gap == bottom gap → the grid is centred.
    const leftGap = layout.slots[0]!.bleed.x
    const rightGap = width - (firstRowEnd.bleed.x + firstRowEnd.bleed.width)
    const topGap = layout.slots[0]!.bleed.y
    const bottomGap = height - (lastRowStart.bleed.y + lastRowStart.bleed.height)
    expect(leftGap).toBeCloseTo(rightGap, 3)
    expect(topGap).toBeCloseTo(bottomGap, 3)
  })

  it('keeps duplex back margins equal to the front (the X-mirror is symmetric)', () => {
    const layout = computePageLayout(base)
    const { width } = pageDimensionsPt(base)
    // Back pages mirror each card in X (mirroredLeft = pageW − (bleed.x + width)),
    // so an off-centre grid would give the back a different left margin. Centred,
    // the mirrored grid reproduces the front's margins.
    const frontLeftMargin = Math.min(...layout.slots.map((s) => s.bleed.x))
    const backLeftMargin = Math.min(
      ...layout.slots.map((s) => width - (s.bleed.x + s.bleed.width))
    )
    expect(backLeftMargin).toBeCloseTo(frontLeftMargin, 3)
  })

  it('page-centres the grid even when left/right margins differ', () => {
    const opts = { ...base, marginLeftMm: 20, marginRightMm: 2 }
    const layout = computePageLayout(opts)
    const { width } = pageDimensionsPt(opts)
    const firstRowEnd = layout.slots[layout.columns - 1]!
    // Despite unequal margins, the grid is centred on the page so the left gap
    // equals the right gap — which is what keeps a mirrored duplex back aligned.
    const leftGap = layout.slots[0]!.bleed.x
    const rightGap = width - (firstRowEnd.bleed.x + firstRowEnd.bleed.width)
    expect(leftGap).toBeCloseTo(rightGap, 3)
    expect(leftGap).toBeGreaterThanOrEqual(mmToPt(20) - 0.01) // clears the larger margin
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
