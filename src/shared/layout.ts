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
/** 'plain' draws a flat dark back; 'custom' uses a user-uploaded back image. */
export type CardBackStyle = 'none' | 'plain' | 'custom'
/**
 * How the bleed border is produced:
 *  - 'solid'  — a flat band of the card's sampled border colour (default).
 *  - 'extend' — each edge pixel replicated straight outward.
 *  - 'zoom'   — no border; the card is enlarged at layout time to fill the bleed.
 */
export type BleedMode = 'solid' | 'zoom' | 'extend'
/**
 * Colour adjustment applied to card art at PDF export, compensating for how home
 * printers reproduce colour: 'inkjet' lifts saturation/brightness (inkjets print
 * dark and washed-out), 'laser' boosts saturation and sharpens (laser output is
 * flatter). 'none' leaves the art untouched.
 */
export type ColorProfile = 'none' | 'inkjet' | 'laser'

export interface ExportOptions {
  pageSize: PageSize
  orientation: Orientation
  /** Used only when pageSize is 'custom'. */
  customWidthMm: number
  customHeightMm: number
  bleedMm: number
  /** Page margins per edge in mm (0 = print right to the page edge). */
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  /** Gap between columns (horizontal) and rows (vertical), in mm. */
  columnSpacingMm: number
  rowSpacingMm: number
  cutGuideStyle: CutGuideStyle
  /** When not 'none', interleave mirrored back pages for duplex printing. */
  cardBack: CardBackStyle
  bleedMode: BleedMode
  /**
   * Print-scale compensation: the printed card size is multiplied by this / 100.
   * Use the calibration page to find the value (e.g. a printer that outputs at
   * 98% needs ~102 here). 100 = no compensation.
   */
  scalePercent: number
  /** Colour adjustment for the target printer (PDF export). */
  colorProfile: ColorProfile
  /** Overlay a faint diagonal "PROXY" watermark on each card (PDF export). */
  watermark: boolean
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  pageSize: 'a4',
  orientation: 'portrait',
  customWidthMm: 210,
  customHeightMm: 297,
  bleedMm: 2,
  // 4mm keeps the standard 3×3 = 9 cards per A4 page even with 2mm bleed
  // (3 × (63+4)mm = 201mm fits A4's 210mm width).
  marginTopMm: 4,
  marginRightMm: 4,
  marginBottomMm: 4,
  marginLeftMm: 4,
  columnSpacingMm: 0,
  rowSpacingMm: 0,
  cutGuideStyle: 'outline',
  cardBack: 'none',
  bleedMode: 'solid',
  scalePercent: 100,
  colorProfile: 'none',
  watermark: false
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
  const marginTop = mmToPt(options.marginTopMm)
  const marginRight = mmToPt(options.marginRightMm)
  const marginBottom = mmToPt(options.marginBottomMm)
  const marginLeft = mmToPt(options.marginLeftMm)
  const spacingX = mmToPt(options.columnSpacingMm)
  const spacingY = mmToPt(options.rowSpacingMm)

  // Scale compensation enlarges/shrinks the printed card so it trims to the true
  // size on printers that don't output at exactly 100%.
  const scale = options.scalePercent > 0 ? options.scalePercent / 100 : 1
  const cutW = mmToPt(CARD_WIDTH_MM) * scale
  const cutH = mmToPt(CARD_HEIGHT_MM) * scale
  const footW = cutW + bleed * 2
  const footH = cutH + bleed * 2

  const usableW = pageWidthPt - marginLeft - marginRight
  const usableH = pageHeightPt - marginTop - marginBottom
  const columns = Math.max(0, Math.floor((usableW + spacingX) / (footW + spacingX)))
  const rows = Math.max(0, Math.floor((usableH + spacingY) / (footH + spacingY)))

  // Anchor the grid at the top-left margins so each edge margin is honoured
  // exactly (a 0 margin prints right to that edge); slack falls to right/bottom.
  const originX = marginLeft
  const originY = marginTop

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
  /** Rotate this card 180° when drawn (e.g. flip/Aftermath cards or alignment). */
  rotate?: boolean
  /** A blank layout spacer — occupies a grid cell but prints nothing. */
  spacer?: boolean
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
