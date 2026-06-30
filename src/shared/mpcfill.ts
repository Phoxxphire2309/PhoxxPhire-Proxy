/**
 * MPCFill (MPC Autofill, https://mpcfill.com) as an alternative card-image
 * source. Where Scryfall serves one canonical scan per printing, MPCFill is a
 * community aggregator: searching a card name returns many print-ready proxy
 * images, each hosted as a Google Drive file and identified by its Drive file
 * id. The user picks which image to use per card; cards with no pick fall back
 * to Scryfall.
 */

import { IMAGE_PROTOCOL, type Card, type ImageQuality } from './scryfall'

/** MPCFill indexes art by kind; tokens/emblems live apart from normal cards. */
export type MpcfillCardType = 'CARD' | 'TOKEN'

/**
 * Which MPCFill index a card's art lives in. Tokens and emblems are indexed
 * under `TOKEN` (so a "Blood" token finds Blood token art, not the card named
 * Blood); everything else is a `CARD`.
 */
export function mpcfillCardType(card: Pick<Card, 'layout' | 'typeLine'>): MpcfillCardType {
  const layout = card.layout?.toLowerCase() ?? ''
  const typeLine = card.typeLine?.toLowerCase() ?? ''
  const tokenish =
    layout.includes('token') ||
    layout === 'emblem' ||
    typeLine.includes('token') ||
    typeLine.includes('emblem')
  return tokenish ? 'TOKEN' : 'CARD'
}

/** A single MPCFill image option for a card (one Google Drive file). */
export interface MpcfillImage {
  /** Google Drive file id — the stable key for this exact image. */
  identifier: string
  /** Display name, e.g. "Sol Ring (Dom)". */
  name: string
  /** Contributing source / drive, e.g. "MrTeferi". */
  source: string
  /** Image resolution in DPI (higher is better for print). */
  dpi: number
  /** File extension, e.g. "png" or "jpg". */
  extension: string
}

/** Which MPCFill image a user has chosen for a given card face. */
export interface MpcfillSelection {
  identifier: string
  name: string
  source: string
}

/**
 * Renderer-facing URL for an MPCFill image, resolved by the main process to a
 * cached Google Drive download. Mirrors `faceImageUrl` but addresses a Drive
 * file id rather than a Scryfall card+face, so the `<img>` naturally re-fetches
 * when the chosen image changes.
 */
export function mpcfillImageUrl(
  identifier: string,
  quality: ImageQuality = 'source',
  version?: number | string
): string {
  const base = `${IMAGE_PROTOCOL}://mpcfill/${encodeURIComponent(identifier)}/${quality}`
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`
}

/** Stable key for a card face's MPCFill selection (matches the upscale faceKey). */
export function mpcfillFaceKey(cardId: string, faceIndex: number): string {
  return `${cardId}:${faceIndex}`
}
