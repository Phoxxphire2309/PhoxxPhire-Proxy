/**
 * Print layout maths for proxy sheets, shared between processes.
 *
 * Everything is computed in PDF points (1/72") using a top-left origin (the PDF
 * generator flips Y when drawing). Each card occupies a "footprint" = the cut
 * size (63×88mm) expanded by the bleed on all sides; the cut rectangle is
 * centred inside it, so bleed never overlaps a neighbour and cut guides land
 * exactly on the trim line.
 */

import { CARD_HEIGHT_MM, CARD_WIDTH_MM, mmToPt } from './units'

export type PageSize = 'a4' | 'letter' | 'legal' | 'a3' | 'custom'
export type Orientation = 'portrait' | 'landscape'
export type CutGuideStyle = 'none' | 'outline' | 'corners'
export type CardBackStyle = 'none' | 'plain'
/**
 * How the bleed border is produced:
 *  - 'solid'  — a flat band of the card's sampled border colour (default).
 *  - 'extend' — each edge pixel replicated straight outward.
 *  - 'zoom'   — no border; the card is enlarged at layout time to fill the bleed.
 */
export type BleedMode = 'solid' | 'zoom' | 'extend'

export interface ExportOptions {
  pageSize: PageSize
  orientation: Orientation
  /** Used only when pageSize is 'custom'. */
  customWidthMm: number
  customHeightMm: number
  bleedMm: number
  marginMm: number
  /** Gap between columns (horizontal) and rows (vertical), in mm. */
  columnSpacingMm: number
  rowSpacingMm: number
  cutGuideStyle: CutGuideStyle
  /** When not 'none', interleave mirrored back pages for duplex printing. */
  cardBack: CardBackStyle
  bleedMode: BleedMode
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  pageSize: 'a4',
  orientation: 'portrait',
  customWidthMm: 210,
  customHeightMm: 297,
  bleedMm: 2,
  // 4mm keeps the standard 3×3 = 9 cards per A4 page even with 2mm bleed
  // (3 × (63+4)mm = 201mm fits A4's 210mm width).
  marginMm: 4,
  columnSpacingMm: 0,
  rowSpacingMm: 0,
  cutGuideStyle: 'outline',
  cardBack: 'none',
  bleedMode: 'solid'
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Slot {
  /** The full printed area (image is drawn here, including bleed). */
  bleed: Rect
  /** The trim rectangle (card size); cut guides are drawn on its edges. */
  cut: Rect
}

export interface PageLayout {
  pageWidthPt: number
  pageHeightPt: number
  columns: number
  rows: number
  perPage: number
  /** Slot rectangles for a single page (length === perPage). */
  slots: Slot[]
}

/** Portrait page dimensions in points for the named sizes. */
const PAGE_PT: Record<Exclude<PageSize, 'custom'>, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 }, // 210 × 297 mm
  letter: { width: 612, height: 792 }, // 8.5 × 11 in
  legal: { width: 612, height: 1008 }, // 8.5 × 14 in
  a3: { width: 841.89, height: 1190.55 } // 297 × 420 mm
}

/** Resolves the page size + orientation (+ custom dimensions) to points. */
export function pageDimensionsPt(options: ExportOptions): { width: number; height: number } {
  const portrait =
    options.pageSize === 'custom'
      ? { width: mmToPt(options.customWidthMm), height: mmToPt(options.customHeightMm) }
      : PAGE_PT[options.pageSize]
  return options.orientation === 'landscape'
    ? { width: portrait.height, height: portrait.width }
    : portrait
}

export function computePageLayout(options: ExportOptions): PageLayout {
  const { width: pageWidthPt, height: pageHeightPt } = pageDimensionsPt(options)
  const bleed = mmToPt(options.bleedMm)
  const margin = mmToPt(options.marginMm)
  const spacingX = mmToPt(options.columnSpacingMm)
  const spacingY = mmToPt(options.rowSpacingMm)

  const cutW = mmToPt(CARD_WIDTH_MM)
  const cutH = mmToPt(CARD_HEIGHT_MM)
  const footW = cutW + bleed * 2
  const footH = cutH + bleed * 2

  const usableW = pageWidthPt - margin * 2
  const usableH = pageHeightPt - margin * 2
  const columns = Math.max(0, Math.floor((usableW + spacingX) / (footW + spacingX)))
  const rows = Math.max(0, Math.floor((usableH + spacingY) / (footH + spacingY)))

  // Centre the grid block on the page (margins end up >= the requested margin).
  const gridW = columns > 0 ? columns * footW + (columns - 1) * spacingX : 0
  const gridH = rows > 0 ? rows * footH + (rows - 1) * spacingY : 0
  const originX = (pageWidthPt - gridW) / 2
  const originY = (pageHeightPt - gridH) / 2

  const slots: Slot[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const bx = originX + col * (footW + spacingX)
      const by = originY + row * (footH + spacingY)
      slots.push({
        bleed: { x: bx, y: by, width: footW, height: footH },
        cut: { x: bx + bleed, y: by + bleed, width: cutW, height: cutH }
      })
    }
  }

  return { pageWidthPt, pageHeightPt, columns, rows, perPage: columns * rows, slots }
}

export function pageCountFor(slotCount: number, perPage: number): number {
  return perPage > 0 ? Math.ceil(slotCount / perPage) : 0
}

/** One printable card image: a single card face, with the quality to print it at. */
export interface ExportSlot {
  cardId: string
  faceIndex: number
  /** Whether to use the upscaled image for this slot (else the original). */
  upscale: boolean
}

export interface ExportRequest {
  /** Fully expanded, ordered list of printable slots (one per printed card image). */
  slots: ExportSlot[]
  options: ExportOptions
}

export type ExportOutcome =
  | { canceled: true }
  | { canceled: false; path: string; cardCount: number; pageCount: number }

export type ExportImagesOutcome =
  | { canceled: true }
  | { canceled: false; path: string; count: number }

export type CalibrationOutcome = { canceled: true } | { canceled: false; path: string }

export interface ExportProgress {
  phase: 'preparing' | 'rendering' | 'done'
  completed: number
  total: number
}
