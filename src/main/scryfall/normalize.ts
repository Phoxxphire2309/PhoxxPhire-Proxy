import type {
  Card,
  CardFace,
  CardPrices,
  ScryfallCard,
  ScryfallImageUris,
  ScryfallPrices
} from '@shared/scryfall'

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
  return {
    id: raw.id,
    oracleId: raw.oracle_id ?? null,
    name: raw.name,
    setCode: raw.set,
    collectorNumber: raw.collector_number,
    lang: raw.lang,
    layout: raw.layout,
    faces: extractFaces(raw),
    prices: extractPrices(raw.prices)
  }
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
