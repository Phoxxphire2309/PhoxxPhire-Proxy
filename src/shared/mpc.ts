/**
 * Types + constants for exporting a deck as a MakePlayingCards (MPC) order via
 * the MPC Autofill format. The export produces a folder of print-ready,
 * full-bleed card images plus an `order.xml` describing the order, which the
 * MPC Autofill desktop tool consumes to auto-fill a MakePlayingCards.com order.
 *
 * MPC standard ("poker") cards print at 2.5 × 3.5 in with a 36px (≈3 mm) bleed
 * on each side; the minimum upload is 822 × 1122 px @ 300 DPI. We export at 2×
 * that (1644 × 2244 px) so the upscaled art has headroom.
 */

/** A single distinct card in an MPC order: its copies and image quality. */
export interface MpcCard {
  cardId: string
  /** Number of physical copies to print. */
  quantity: number
  /** Use the upscaled image (else the original Scryfall download). */
  upscale: boolean
}

export interface MpcExportRequest {
  cards: MpcCard[]
}

export type MpcExportOutcome =
  | { canceled: true }
  | { canceled: false; path: string; cardCount: number; fileCount: number }

/**
 * MPC order-size brackets (the price tiers MakePlayingCards offers). An order's
 * `<bracket>` is the smallest bracket that fits its card count.
 */
export const MPC_BRACKETS = [
  18, 36, 55, 72, 90, 108, 126, 144, 162, 180, 198, 216, 234, 396, 504, 612
] as const

/** Default card stock label MPC Autofill expects. */
export const MPC_DEFAULT_STOCK = '(S30) Standard Smooth'

/** Full-bleed export dimensions in pixels (2× the 300-DPI minimum). */
export const MPC_IMAGE_WIDTH = 1644
export const MPC_IMAGE_HEIGHT = 2244
/** Bleed (px per side) baked into the exported image at the above dimensions. */
export const MPC_BLEED_PX = 72

/** Smallest MPC bracket that fits `quantity` cards (capped at the largest). */
export function mpcBracket(quantity: number): number {
  for (const bracket of MPC_BRACKETS) {
    if (quantity <= bracket) return bracket
  }
  return MPC_BRACKETS[MPC_BRACKETS.length - 1]!
}
