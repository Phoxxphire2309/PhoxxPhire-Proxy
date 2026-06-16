import type {
  Card,
  CardFace,
  CardPrices,
  ImageStatus,
  RelatedToken,
  ScryfallCard,
  ScryfallImageUris,
  ScryfallPrices
} from '@shared/scryfall'

const IMAGE_STATUSES: ReadonlySet<string> = new Set([
  'missing',
  'placeholder',
  'lowres',
  'highres_scan'
])

function parseImageStatus(value: string | undefined): ImageStatus | undefined {
  return value !== undefined && IMAGE_STATUSES.has(value) ? (value as ImageStatus) : undefined
}

/** Highest-quality image URL available for a face, or null if none. */
function pickImage(uris: ScryfallImageUris | undefined): string | null {
  if (!uris) return null
  return uris.png ?? uris.large ?? uris.normal ?? null
}

/** Medium JPEG for browsing thumbnails (small + fast), or null if none. */
function pickThumb(uris: ScryfallImageUris | undefined): string | null {
  if (!uris) return null
  return uris.normal ?? uris.large ?? uris.small ?? null
}

function parsePrice(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function extractPrices(prices: ScryfallPrices | undefined): CardPrices {
  return {
    usd: parsePrice(prices?.usd),
    usdFoil: parsePrice(prices?.usd_foil),
    usdEtched: parsePrice(prices?.usd_etched),
    eur: parsePrice(prices?.eur),
    eurFoil: parsePrice(prices?.eur_foil),
    tix: parsePrice(prices?.tix)
  }
}

/**
 * Collapses a raw Scryfall card into our normalized form.
 *
 * Cards with a single combined image (normal, split, flip, adventure) expose a
 * top-level `image_uris`; double-faced cards (transform, modal DFC, meld) carry
 * per-face images under `card_faces`. We surface one face per printable side.
 */
export function normalizeCard(raw: ScryfallCard): Card {
  const imageStatus = parseImageStatus(raw.image_status)
  return {
    id: raw.id,
    oracleId: raw.oracle_id ?? null,
    name: raw.name,
    setCode: raw.set,
    collectorNumber: raw.collector_number,
    lang: raw.lang,
    layout: raw.layout,
    faces: extractFaces(raw),
    prices: extractPrices(raw.prices),
    relatedTokens: extractRelatedTokens(raw),
    ...(imageStatus ? { imageStatus } : {}),
    ...(typeof raw.cmc === 'number' ? { cmc: raw.cmc } : {}),
    ...(raw.type_line !== undefined ? { typeLine: raw.type_line } : {}),
    ...(() => {
      const colors = extractColors(raw)
      return colors ? { colors } : {}
    })(),
    ...(raw.rarity !== undefined ? { rarity: raw.rarity } : {}),
    ...(Array.isArray(raw.finishes) ? { finishes: raw.finishes } : {}),
    ...(raw.legalities ? { legalities: raw.legalities } : {}),
    ...(raw.border_color !== undefined ? { borderColor: raw.border_color } : {}),
    ...(Array.isArray(raw.frame_effects) ? { frameEffects: raw.frame_effects } : {}),
    ...(raw.full_art !== undefined ? { fullArt: raw.full_art } : {}),
    ...(raw.textless !== undefined ? { textless: raw.textless } : {}),
    ...(raw.oversized !== undefined ? { oversized: raw.oversized } : {}),
    ...(raw.digital !== undefined ? { digital: raw.digital } : {}),
    ...(Array.isArray(raw.games) ? { games: raw.games } : {}),
    ...(Array.isArray(raw.promo_types) ? { promoTypes: raw.promo_types } : {}),
    ...(raw.set_type !== undefined ? { setType: raw.set_type } : {}),
    ...(raw.security_stamp !== undefined ? { securityStamp: raw.security_stamp } : {}),
    ...(raw.content_warning !== undefined ? { contentWarning: raw.content_warning } : {})
  }
}

const WUBRG: ReadonlySet<string> = new Set(['W', 'U', 'B', 'R', 'G'])

/**
 * A card's colours. Prefers Scryfall's top-level `colors`, but multi-faced
 * cards (modal DFC, transform) report colours only per face, so we union the
 * faces' `colors` (and, as a backstop, the colours in their mana costs) when
 * the top level is absent — otherwise such cards look colourless.
 */
function extractColors(raw: ScryfallCard): string[] | undefined {
  if (Array.isArray(raw.colors)) return raw.colors
  const found = new Set<string>()
  for (const face of raw.card_faces ?? []) {
    for (const color of face.colors ?? []) found.add(color)
    for (const match of (face.mana_cost ?? '').matchAll(/\{([^}]+)\}/g)) {
      for (const symbol of match[1]!) if (WUBRG.has(symbol)) found.add(symbol)
    }
  }
  return found.size > 0 ? [...found] : undefined
}

/**
 * Pulls the tokens / emblems a card creates from its `all_parts`. Scryfall lists
 * these with `component: 'token'` (emblems included); the card's own entry uses
 * a different component, so filtering by component also excludes self-references.
 */
function extractRelatedTokens(raw: ScryfallCard): RelatedToken[] {
  const seen = new Set<string>()
  const tokens: RelatedToken[] = []
  for (const part of raw.all_parts ?? []) {
    if (part.component !== 'token' || part.id === raw.id || seen.has(part.id)) continue
    seen.add(part.id)
    tokens.push({ id: part.id, name: part.name, typeLine: part.type_line })
  }
  return tokens
}

/** Oracle text fields (for text proxies) from a card or a card face. */
function faceOracle(source: {
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  power?: string
  toughness?: string
  loyalty?: string
}): Partial<CardFace> {
  return {
    ...(source.mana_cost ? { manaCost: source.mana_cost } : {}),
    ...(source.type_line ? { typeLine: source.type_line } : {}),
    ...(source.oracle_text ? { oracleText: source.oracle_text } : {}),
    ...(source.power !== undefined ? { power: source.power } : {}),
    ...(source.toughness !== undefined ? { toughness: source.toughness } : {}),
    ...(source.loyalty !== undefined ? { loyalty: source.loyalty } : {})
  }
}

function extractFaces(raw: ScryfallCard): CardFace[] {
  const topImage = pickImage(raw.image_uris)
  if (topImage) {
    const thumb = pickThumb(raw.image_uris)
    return [
      {
        name: raw.name,
        imageUrl: topImage,
        ...(thumb ? { thumbUrl: thumb } : {}),
        ...faceOracle(raw)
      }
    ]
  }

  const faces: CardFace[] = []
  for (const face of raw.card_faces ?? []) {
    const imageUrl = pickImage(face.image_uris)
    if (imageUrl) {
      const thumb = pickThumb(face.image_uris)
      faces.push({
        name: face.name,
        imageUrl,
        ...(thumb ? { thumbUrl: thumb } : {}),
        ...faceOracle(face)
      })
    }
  }
  return faces
}
