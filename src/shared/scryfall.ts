/**
 * Scryfall-related types shared between the main process and the renderer,
 * plus the small helpers both sides need to address card images.
 *
 * We deliberately model only the slice of the Scryfall schema we use; the raw
 * `Scryfall*` shapes mirror the API, and the `Card`/`CardFace` shapes are the
 * normalized form everything downstream (cache, IPC, UI, layout) consumes.
 */

/** Image variants Scryfall exposes. We prefer `png` (745×1040, highest quality). */
export interface ScryfallImageUris {
  small?: string
  normal?: string
  large?: string
  png?: string
  art_crop?: string
  border_crop?: string
}

export interface ScryfallCardFace {
  name: string
  image_uris?: ScryfallImageUris
}

/**
 * An entry in a card's `all_parts` — a related card (token, emblem, meld piece,
 * combo piece). We use the `token` component to surface the tokens/emblems a
 * card creates so they can be added to the deck.
 */
export interface ScryfallRelatedCard {
  id: string
  component: string
  name: string
  type_line: string
  uri: string
}

/** Per-printing prices Scryfall reports (strings or null), updated ~daily. */
export interface ScryfallPrices {
  usd?: string | null
  usd_foil?: string | null
  usd_etched?: string | null
  eur?: string | null
  eur_foil?: string | null
  tix?: string | null
}

/** Subset of a Scryfall card object that we rely on. */
export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  set: string
  collector_number: string
  lang: string
  layout: string
  image_uris?: ScryfallImageUris
  card_faces?: ScryfallCardFace[]
  prices?: ScryfallPrices
  all_parts?: ScryfallRelatedCard[]
}

/** Generic Scryfall paginated list envelope. */
export interface ScryfallList<T> {
  object: 'list'
  total_cards?: number
  has_more: boolean
  next_page?: string
  data: T[]
}

/** A single printable face of a card (one for most cards, two for DFCs). */
export interface CardFace {
  name: string
  /** Source (Scryfall) image URL for this face, highest quality available. */
  imageUrl: string
}

/** Parsed per-printing prices (numbers, or null when unavailable). */
export interface CardPrices {
  usd: number | null
  usdFoil: number | null
  usdEtched: number | null
  eur: number | null
  eurFoil: number | null
  tix: number | null
}

/** A token or emblem a card creates, in normalized form. */
export interface RelatedToken {
  /** Scryfall id of the token/emblem printing. */
  id: string
  name: string
  typeLine: string
}

/** Normalized card used across IPC and the renderer. */
export interface Card {
  id: string
  oracleId: string | null
  name: string
  setCode: string
  collectorNumber: string
  lang: string
  layout: string
  faces: CardFace[]
  prices: CardPrices
  /** Tokens / emblems this card creates (from Scryfall `all_parts`). */
  relatedTokens: RelatedToken[]
}

/** Best available non-foil USD price, falling back to etched/foil. */
export function bestUsd(prices: CardPrices): number | null {
  return prices.usd ?? prices.usdEtched ?? prices.usdFoil
}

/** Formats a USD amount, or an em dash when the price is unknown. */
export function formatUsd(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(2)}`
}

export interface SearchResult {
  cards: Card[]
  totalCards: number
  hasMore: boolean
}

/** Custom Electron protocol used to serve cached / upscaled images. */
export const IMAGE_PROTOCOL = 'phoxx-image'

/** Which variant of a face image to serve: the raw Scryfall download or the upscaled one. */
export type ImageQuality = 'source' | 'upscaled'

/**
 * Renderer-facing URL for a card face image. The main process resolves this to
 * a cached file (downloading + upscaling on demand), which keeps remote hosts
 * out of the renderer's CSP and centralises the upscaling decision in one place.
 */
export function faceImageUrl(
  cardId: string,
  faceIndex: number,
  quality: ImageQuality = 'upscaled',
  version?: number | string
): string {
  const base = `${IMAGE_PROTOCOL}://card/${encodeURIComponent(cardId)}/${faceIndex}/${quality}`
  // The protocol handler ignores the query; it only exists to bust the <img> cache
  // when upscale settings change so the new variant is re-requested.
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`
}
