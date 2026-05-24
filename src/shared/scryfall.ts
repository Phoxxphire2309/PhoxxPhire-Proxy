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

/** Scryfall's assessment of a printing's image quality. */
export type ImageStatus = 'missing' | 'placeholder' | 'lowres' | 'highres_scan'

/** Subset of a Scryfall card object that we rely on. */
export interface ScryfallCard {
  id: string
  oracle_id?: string
  name: string
  set: string
  collector_number: string
  lang: string
  layout: string
  image_status?: string
  cmc?: number
  type_line?: string
  colors?: string[]
  finishes?: string[]
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
  /** Scryfall's image-quality rating for this printing (drives best-source selection). */
  imageStatus?: ImageStatus
  /** Converted mana cost / mana value, for the deck mana curve. */
  cmc?: number
  /** Full type line, e.g. "Legendary Creature — Goblin". */
  typeLine?: string
  /** Colour letters present on the card (W/U/B/R/G). */
  colors?: string[]
  /** Available finishes for this printing: 'nonfoil' | 'foil' | 'etched'. */
  finishes?: string[]
}

/**
 * Whether a printing is available in a regular non-foil finish. Foil-only and
 * etched-only printings can scan/print poorly, so bulk selection avoids them.
 * Printings with unknown finishes (older cache) are treated as non-foil.
 */
export function isNonFoil(card: Pick<Card, 'finishes'>): boolean {
  return card.finishes === undefined || card.finishes.includes('nonfoil')
}

/** Non-foil printings, or all of them when none are non-foil (so a pick is always possible). */
export function nonFoilPrintings(cards: Card[]): Card[] {
  const nonFoil = cards.filter(isNonFoil)
  return nonFoil.length > 0 ? nonFoil : cards
}

/** Higher is better. Used to pick the highest-quality printing to upscale from. */
export function imageStatusRank(status: ImageStatus | undefined): number {
  switch (status) {
    case 'highres_scan':
      return 3
    case 'lowres':
      return 2
    case 'placeholder':
      return 1
    default:
      return 0
  }
}

/** Whether a card's source image is a full high-resolution scan. */
export function isHighRes(card: Pick<Card, 'imageStatus'>): boolean {
  return card.imageStatus === 'highres_scan'
}

/**
 * The printing with the best image quality among the given cards (highest
 * `image_status` rank), keeping the first on ties. Returns null for an empty list.
 */
export function bestPrinting(cards: Card[]): Card | null {
  let best: Card | null = null
  let bestRank = -1
  for (const card of cards) {
    const rank = imageStatusRank(card.imageStatus)
    if (rank > bestRank) {
      best = card
      bestRank = rank
    }
  }
  return best
}

/**
 * The cheapest printing by NON-FOIL (`usd`) price; foil-only printings (no
 * regular price) are deprioritised so bulk-switching doesn't pick foils, which
 * can print poorly. Keeps the first on ties; falls back to the first card.
 */
export function cheapestPrinting(cards: Card[]): Card | null {
  let cheapest: Card | null = null
  let lowest = Infinity
  for (const card of cards) {
    const price = card.prices.usd ?? Infinity
    if (price < lowest) {
      cheapest = card
      lowest = price
    }
  }
  return cheapest ?? cards[0] ?? null
}

/**
 * The most expensive printing by NON-FOIL (`usd`) price; foil-only printings
 * rank lowest so foils aren't chosen. Keeps the first on ties; falls back to the
 * first card.
 */
export function mostExpensivePrinting(cards: Card[]): Card | null {
  let best: Card | null = null
  let highest = -Infinity
  for (const card of cards) {
    const price = card.prices.usd ?? -Infinity
    if (price > highest) {
      best = card
      highest = price
    }
  }
  return best ?? cards[0] ?? null
}

/**
 * The newest printing, assuming `cards` is ordered oldest→newest (which is how
 * `getPrintings` returns them, sorted by release date ascending).
 */
export function newestPrinting(cards: Card[]): Card | null {
  return cards[cards.length - 1] ?? null
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
