import type { DeckLine } from '@shared/decklist'

/**
 * Fetches a decklist from a supported deck-building site URL and returns it as
 * parsed lines (which then go through the normal Scryfall resolution path).
 * `fetchFn` is injectable for testing.
 */
const ARCHIDEKT_RE = /archidekt\.com\/(?:api\/)?decks\/(\d+)/i
const MOXFIELD_RE = /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i

interface ArchidektCard {
  quantity: number
  category?: string
  card: {
    collectorNumber?: string
    oracleCard?: { name?: string }
    edition?: { editioncode?: string }
  }
}

interface MoxfieldEntry {
  quantity: number
  card: { name?: string; set?: string; cn?: string }
}

function line(
  quantity: number,
  name: string,
  setCode?: string,
  collectorNumber?: string
): DeckLine {
  return {
    quantity: Math.max(1, quantity || 1),
    name,
    ...(setCode ? { setCode } : {}),
    ...(collectorNumber ? { collectorNumber } : {})
  }
}

async function fetchArchidekt(id: string, fetchFn: typeof fetch): Promise<DeckLine[]> {
  const response = await fetchFn(`https://archidekt.com/api/decks/${id}/`, {
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`Archidekt returned HTTP ${response.status}.`)
  const data = (await response.json()) as { cards?: ArchidektCard[] }

  return (data.cards ?? [])
    .filter((entry) => entry.category !== 'Maybeboard' && entry.card.oracleCard?.name)
    .map((entry) =>
      line(
        entry.quantity,
        entry.card.oracleCard!.name!,
        entry.card.edition?.editioncode,
        entry.card.collectorNumber
      )
    )
}

async function fetchMoxfield(publicId: string, fetchFn: typeof fetch): Promise<DeckLine[]> {
  const response = await fetchFn(`https://api2.moxfield.com/v3/decks/all/${publicId}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'PhoxxPhireProxy/0.1' }
  })
  if (!response.ok) {
    throw new Error(
      `Moxfield returned HTTP ${response.status}. Their API is often restricted — try pasting the decklist text instead.`
    )
  }
  const data = (await response.json()) as {
    boards?: Record<string, { cards?: Record<string, MoxfieldEntry> }>
  }

  const lines: DeckLine[] = []
  for (const boardName of ['mainboard', 'commanders']) {
    const cards = data.boards?.[boardName]?.cards
    if (!cards) continue
    for (const entry of Object.values(cards)) {
      if (entry.card.name) {
        lines.push(line(entry.quantity, entry.card.name, entry.card.set, entry.card.cn))
      }
    }
  }
  return lines
}

export async function fetchDeckLines(
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<DeckLine[]> {
  const archidekt = ARCHIDEKT_RE.exec(url)
  if (archidekt) return fetchArchidekt(archidekt[1]!, fetchFn)

  const moxfield = MOXFIELD_RE.exec(url)
  if (moxfield) return fetchMoxfield(moxfield[1]!, fetchFn)

  throw new Error('Unsupported deck URL. Supported sites: Archidekt, Moxfield.')
}
