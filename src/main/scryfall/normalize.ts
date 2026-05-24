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
    ...(Array.isArray(raw.colors) ? { colors: raw.colors } : {}),
    ...(Array.isArray(raw.finishes) ? { finishes: raw.finishes } : {})
  }
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

function extractFaces(raw: ScryfallCard): CardFace[] {
  const topImage = pickImage(raw.image_uris)
  if (topImage) {
    return [{ name: raw.name, imageUrl: topImage }]
  }

  const faces: CardFace[] = []
  for (const face of raw.card_faces ?? []) {
    const imageUrl = pickImage(face.image_uris)
    if (imageUrl) faces.push({ name: face.name, imageUrl })
  }
  return faces
}
