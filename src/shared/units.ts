/**
 * Print unit conversions used by the layout engine.
 *
 * PDF coordinates are expressed in points (1/72 inch). MTG cards and bleed are
 * specified in millimetres, so these helpers keep the page-layout maths honest.
 */

const POINTS_PER_INCH = 72
const MM_PER_INCH = 25.4

/** Standard physical size of a Magic card, in millimetres. */
export const CARD_WIDTH_MM = 63
export const CARD_HEIGHT_MM = 88

export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * POINTS_PER_INCH
}

export function inToPt(inches: number): number {
  return inches * POINTS_PER_INCH
}

export function ptToMm(pt: number): number {
  return (pt / POINTS_PER_INCH) * MM_PER_INCH
}

/** Pixels needed to render `mm` at a given DPI (used to size upscaled art). */
export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi)
}
