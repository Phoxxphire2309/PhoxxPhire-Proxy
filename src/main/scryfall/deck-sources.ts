import { parseDecklist, type DeckLine } from '@shared/decklist'

/**
 * Fetches a decklist from a supported deck-building site URL and returns it as
 * parsed lines (which then go through the normal Scryfall resolution path).
 * `fetchFn` is injectable for testing.
 */
const ARCHIDEKT_RE = /archidekt\.com\/(?:api\/)?decks\/(\d+)/i
const MOXFIELD_RE = /moxfield\.com\/decks\/([A-Za-z0-9_-]+)/i
// Cube Cobra: /cube/<section>/<id> (overview, list, playtest…) or the short /c/<id>.
const CUBECOBRA_RE = /cubecobra\.com\/(?:cube\/\w+|c)\/([\w-]+)/i
const MTGGOLDFISH_RE = /mtggoldfish\.com\/deck\/(?:visual\/|download\/)?(\d+)/i
const TAPPEDOUT_RE = /tappedout\.net\/mtg-decks\/([\w-]+)/i

/** A User-Agent some of these sites require before they'll answer a request. */
const USER_AGENT = 'PhoxxPhireProxy/1.0'

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

/**
 * Fetches a site's own plain-text decklist export and runs it through the
 * shared decklist parser. `site` names the source for error messages. Throws a
 * helpful error when the response isn't ok or doesn't contain a readable list
 * (private decks often redirect to an HTML login page, which parses to nothing).
 */
async function fetchTextDeck(
  url: string,
  site: string,
  fetchFn: typeof fetch
): Promise<DeckLine[]> {
  const response = await fetchFn(url, {
    headers: { Accept: 'text/plain', 'User-Agent': USER_AGENT }
  })
  if (!response.ok) {
    throw new Error(
      `${site} returned HTTP ${response.status}. The deck may be private — try pasting the decklist text instead.`
    )
  }
  const body = await response.text()
  // Private/blocked decks answer 200 with an HTML page; the forgiving decklist
  // parser would turn that markup into junk "cards", so reject it up front.
  if (body.trimStart().startsWith('<')) {
    throw new Error(
      `Couldn't read a decklist from ${site}. The deck may be private or empty — try pasting the decklist text instead.`
    )
  }
  const lines = parseDecklist(body)
  if (lines.length === 0) {
    throw new Error(
      `Couldn't read a decklist from ${site}. The deck may be private or empty — try pasting the decklist text instead.`
    )
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

  const cubecobra = CUBECOBRA_RE.exec(url)
  if (cubecobra) {
    return fetchTextDeck(
      `https://cubecobra.com/cube/api/cubelist/${cubecobra[1]!}`,
      'Cube Cobra',
      fetchFn
    )
  }

  const goldfish = MTGGOLDFISH_RE.exec(url)
  if (goldfish) {
    return fetchTextDeck(
      `https://www.mtggoldfish.com/deck/download/${goldfish[1]!}`,
      'MTGGoldfish',
      fetchFn
    )
  }

  const tappedout = TAPPEDOUT_RE.exec(url)
  if (tappedout) {
    return fetchTextDeck(
      `https://tappedout.net/mtg-decks/${tappedout[1]!}/?fmt=txt`,
      'TappedOut',
      fetchFn
    )
  }

  throw new Error(
    'Unsupported deck URL. Supported sites: Archidekt, Moxfield, Cube Cobra, MTGGoldfish, TappedOut.'
  )
}
