import { describe, expect, it } from 'vitest'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, inToPt, mmToPt, mmToPx, ptToMm } from '@shared/units'

describe('units', () => {
  it('converts inches to points at 72pt/inch', () => {
    expect(inToPt(1)).toBe(72)
    expect(inToPt(2.5)).toBe(180)
  })

  it('converts millimetres to points', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 6)
    expect(mmToPt(0)).toBe(0)
  })

  it('round-trips mm -> pt -> mm', () => {
    expect(ptToMm(mmToPt(CARD_WIDTH_MM))).toBeCloseTo(CARD_WIDTH_MM, 6)
    expect(ptToMm(mmToPt(CARD_HEIGHT_MM))).toBeCloseTo(CARD_HEIGHT_MM, 6)
  })

  it('sizes a card in pixels for a target DPI', () => {
    // A 63mm card at 300 DPI is ~744px wide.
    expect(mmToPx(CARD_WIDTH_MM, 300)).toBe(744)
    expect(mmToPx(CARD_HEIGHT_MM, 300)).toBe(1039)
  })
})
