import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPORT_OPTIONS, computePageLayout } from '@shared/layout'
import { buildCutFileSvg } from './cutfile'

const NINE_UP = { ...DEFAULT_EXPORT_OPTIONS, bleedMm: 0, marginMm: 6 }

describe('buildCutFileSvg', () => {
  it('emits one cut rect per slot plus four registration marks', () => {
    const svg = buildCutFileSvg(NINE_UP)
    const layout = computePageLayout(NINE_UP)
    expect(svg.startsWith('<?xml')).toBe(true)
    expect((svg.match(/<rect[^>]*stroke="#e0115f"/g) ?? []).length).toBe(layout.slots.length)
    // Four registration marks, each with a filled square.
    expect((svg.match(/fill="#000000"/g) ?? []).length).toBe(4)
    expect(svg).toContain(`width="${layout.pageWidthPt}pt"`)
  })

  it('mirrors the X coordinates for duplex backs', () => {
    const front = buildCutFileSvg(NINE_UP, false)
    const back = buildCutFileSvg(NINE_UP, true)
    expect(front).not.toEqual(back)
    // Same number of cut rects on both sides.
    const count = (s: string): number => (s.match(/stroke="#e0115f"/g) ?? []).length
    expect(count(front)).toBe(count(back))
  })
})
