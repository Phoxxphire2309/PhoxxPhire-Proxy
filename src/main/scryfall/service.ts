import {
  parseDecklist,
  type DeckLine,
  type DeckResolution,
  type DeckResolvedItem,
  type ImportProgress
} from '@shared/decklist'

type ProgressFn = (progress: ImportProgress) => void
import { readFile } from 'node:fs/promises'
import {
  cheapestPrinting,
  isNonFoil,
  nonFoilPrintings,
  type Card,
  type SearchOptions,
  type SearchResult
} from '@shared/scryfall'
import { squareOffCorners } from '../image/processor'
import { renderTextProxy } from '../image/textProxy'
import { CardCache } from './cache'
import { ScryfallClient } from './client'
import { fetchDeckLines } from './deck-sources'

const IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000

/**
 * How long a card's fetched printings stay fresh in memory. Bulk printing
 * switches re-query every card, often several modes in a row (cheapest, then
 * newest, …); caching the printings keeps the second run instant and stops the
 * deck from appearing to stall on a long sequence of network round-trips.
 */
const PRINTINGS_TTL_MS = 10 * 60 * 1000

/**
 * Runs `fn` over every item with at most `limit` in flight at once. Used to cap
 * the burst of disk writes when caching a card with hundreds of printings (basic
 * lands, staples), which would otherwise fire all at once — especially now that
 * bulk switches fetch several cards in parallel.
 */
async function forEachLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items]
  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) await fn(next)
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
}

/** Downloads an image into the given face slot of the cache. */
async function downloadImage(
  url: string,
  fetchFn: typeof fetch,
  userAgent: string,
  timeoutMs: number
): Promise<Uint8Array> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // Scryfall's image CDN (cards.scryfall.io) rejects generic/library agents —
    // a plain Node `fetch` sends `User-Agent: node`, which gets HTTP 400 — so
    // send the same accurate UA the metadata client uses, exactly as Scryfall's
    // API guidelines require.
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: { 'User-Agent': userAgent, Accept: 'image/*,*/*;q=0.8' }
    })
    if (!response.ok) {
      throw new Error(`Image download failed (HTTP ${response.status})`)
    }
    return new Uint8Array(await response.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Orchestrates Scryfall lookups + caching. Search results are persisted so the
 * image protocol can later resolve a card's face URLs without another API call,
 * and `ensureFaceImage` lazily downloads (once) the source image for a face.
 */
export class ScryfallService {
  /** In-memory printings cache keyed by oracle id, with a fetch timestamp. */
  private readonly printingsCache = new Map<string, { cards: Card[]; at: number }>()

  constructor(
    private readonly client: ScryfallClient,
    private readonly cache: CardCache,
    private readonly fetchFn: typeof fetch = fetch,
    // Deck-site fetches go through this; in the app it's Electron's Chromium
    // network stack (net.fetch), which clears Cloudflare bot checks that block
    // a plain Node/undici request to e.g. Moxfield.
    private readonly deckFetch: typeof fetch = fetch
  ) {}

  async init(): Promise<void> {
    await this.cache.init()
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    const result = await this.client.search(query, options)
    await Promise.all(result.cards.map((card) => this.cache.putCard(card)))
    return result
  }

  autocomplete(query: string): Promise<string[]> {
    return this.client.autocomplete(query)
  }

  /** Card metadata by id, served from cache when available, else fetched. */
  async getCard(id: string): Promise<Card> {
    const cached = await this.cache.getCard(id)
    if (cached) return cached
    const card = await this.client.getById(id)
    await this.cache.putCard(card)
    return card
  }

  async getPrintings(oracleId: string): Promise<Card[]> {
    const hit = this.printingsCache.get(oracleId)
    if (hit && Date.now() - hit.at < PRINTINGS_TTL_MS) return hit.cards

    const cards = await this.client.getPrintings(oracleId)
    // Persist with bounded concurrency so a high-printing card doesn't storm the
    // filesystem (and exhaust the libuv thread pool) with hundreds of writes.
    await forEachLimit(cards, 8, (card) => this.cache.putCard(card))
    this.printingsCache.set(oracleId, { cards, at: Date.now() })
    return cards
  }

  /**
   * Given a set of deck cards (by id), returns the distinct tokens / emblems
   * they create, as full cards ready to add to the deck. Tokens already present
   * in `cardIds` are skipped so re-running doesn't offer duplicates.
   */
  async findTokens(cardIds: string[]): Promise<Card[]> {
    const present = new Set(cardIds)
    const wanted = new Map<string, string>() // token id → token name (for fallback ordering)
    for (const cardId of cardIds) {
      const card = await this.getCard(cardId)
      for (const token of card.relatedTokens) {
        if (!present.has(token.id) && !wanted.has(token.id)) wanted.set(token.id, token.name)
      }
    }

    const tokens: Card[] = []
    for (const tokenId of wanted.keys()) {
      try {
        tokens.push(await this.getCard(tokenId))
      } catch {
        // A token printing that can't be fetched is skipped rather than failing
        // the whole lookup.
      }
    }
    return tokens
  }

  /**
   * Parse a decklist and resolve each line to a card. Lines with a set +
   * collector number resolve to that exact printing; otherwise we fuzzy-match
   * by name. Duplicate cards are merged by quantity, and unresolved lines are
   * returned as error messages rather than failing the whole import.
   */
  resolveDeck(
    text: string,
    onProgress?: ProgressFn,
    excludeFoils = false,
    removeBasics = false,
    language = ''
  ): Promise<DeckResolution> {
    return this.resolveLines(parseDecklist(text), onProgress, excludeFoils, removeBasics, language)
  }

  /** Fetch a decklist from a supported site URL and resolve it. */
  async importDeckUrl(
    url: string,
    onProgress?: ProgressFn,
    excludeFoils = false,
    removeBasics = false,
    language = ''
  ): Promise<DeckResolution> {
    return this.resolveLines(
      await fetchDeckLines(url, this.deckFetch),
      onProgress,
      excludeFoils,
      removeBasics,
      language
    )
  }

  /**
   * Swap a resolved card for its printing in `lang` (e.g. 'de'), keeping the
   * original when no localised version of that exact printing exists.
   */
  private async localized(card: Card, lang: string): Promise<Card> {
    try {
      const local = await this.client.getLocalized(card.setCode, card.collectorNumber, lang)
      if (local.faces[0]?.imageUrl) {
        await this.cache.putCard(local)
        return local
      }
    } catch {
      // No localised printing for this card — keep the original.
    }
    return card
  }

  /**
   * When excluding foils, swap a foil-only resolved card for a non-foil printing
   * of the same card (the cheapest one), so the deck prints from a regular scan.
   */
  private async toNonFoil(card: Card): Promise<Card> {
    if (isNonFoil(card) || !card.oracleId) return card
    try {
      const pick = cheapestPrinting(nonFoilPrintings(await this.client.getPrintings(card.oracleId)))
      if (pick && isNonFoil(pick)) {
        await this.cache.putCard(pick)
        return pick
      }
    } catch {
      // Keep the original card if the lookup fails.
    }
    return card
  }

  async resolveLines(
    lines: DeckLine[],
    onProgress?: ProgressFn,
    excludeFoils = false,
    removeBasics = false,
    language = ''
  ): Promise<DeckResolution> {
    const items: DeckResolvedItem[] = []
    const byId = new Map<string, DeckResolvedItem>()
    const errors: string[] = []

    let completed = 0
    for (const line of lines) {
      try {
        const resolved =
          line.setCode && line.collectorNumber
            ? await this.client.getBySetAndNumber(line.setCode, line.collectorNumber)
            : await this.client.named(line.name, false)
        // Skip basic lands (incl. snow basics and Wastes) when asked — you don't
        // proxy basics. They carry "Basic … Land" in the type line.
        if (removeBasics && /\bbasic\b.*\bland\b/i.test(resolved.typeLine ?? '')) {
          completed += 1
          onProgress?.({ completed, total: lines.length, name: line.name })
          continue
        }
        let card = excludeFoils ? await this.toNonFoil(resolved) : resolved
        if (language && card.lang !== language) card = await this.localized(card, language)
        await this.cache.putCard(card)

        const existing = byId.get(card.id)
        if (existing) {
          existing.quantity += line.quantity
        } else {
          const item: DeckResolvedItem = { card, quantity: line.quantity }
          byId.set(card.id, item)
          items.push(item)
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error'
        errors.push(`${line.quantity}× ${line.name}: ${reason}`)
      }
      completed += 1
      onProgress?.({ completed, total: lines.length, name: line.name })
    }

    return { items, errors }
  }

  /** Returns the local path to a face's source image, downloading it if absent. */
  async ensureFaceImage(cardId: string, faceIndex: number): Promise<string> {
    if (await this.cache.hasImage(cardId, faceIndex)) {
      const path = this.cache.sourceImagePath(cardId, faceIndex)
      // Square images cached before corner-squaring existed (squareOffCorners is
      // a no-op once the image is already opaque, so this only rewrites once).
      const bytes = new Uint8Array(await readFile(path))
      const squared = await squareOffCorners(bytes)
      if (squared !== bytes) await this.cache.writeImage(cardId, faceIndex, squared)
      return path
    }

    let card = await this.cache.getCard(cardId)
    if (!card) {
      card = await this.client.getById(cardId)
      await this.cache.putCard(card)
    }

    const face = card.faces[faceIndex]
    if (!face) {
      throw new Error(`Card ${cardId} has no face at index ${faceIndex}`)
    }

    const data = await downloadImage(
      face.imageUrl,
      this.fetchFn,
      this.client.scryfallUserAgent,
      IMAGE_DOWNLOAD_TIMEOUT_MS
    )
    // Square the transparent rounded corners on download (filled with the card's
    // border colour) so every consumer — preview, upscaler, export — sees a clean
    // rectangular card.
    const squared = await squareOffCorners(data)
    return this.cache.writeImage(cardId, faceIndex, squared)
  }

  /**
   * Lazily downloads (once) a medium JPEG thumbnail for browsing — far smaller
   * than the full source PNG, so scrolling search results doesn't fill the cache
   * with print-quality images. No corner squaring (display only).
   */
  async ensureThumbImage(cardId: string, faceIndex: number): Promise<string> {
    if (await this.cache.hasThumb(cardId, faceIndex)) {
      return this.cache.thumbImagePath(cardId, faceIndex)
    }

    let card = await this.cache.getCard(cardId)
    if (!card) {
      card = await this.client.getById(cardId)
      await this.cache.putCard(card)
    }

    const face = card.faces[faceIndex]
    if (!face) {
      throw new Error(`Card ${cardId} has no face at index ${faceIndex}`)
    }

    const data = await downloadImage(
      face.thumbUrl ?? face.imageUrl,
      this.fetchFn,
      this.client.scryfallUserAgent,
      IMAGE_DOWNLOAD_TIMEOUT_MS
    )
    return this.cache.writeThumb(cardId, faceIndex, data)
  }

  /** Renders (once) a text proxy from a face's oracle data and caches the PNG. */
  async ensureProxyImage(cardId: string, faceIndex: number): Promise<string> {
    if (await this.cache.hasProxy(cardId, faceIndex)) {
      return this.cache.proxyImagePath(cardId, faceIndex)
    }

    let card = await this.cache.getCard(cardId)
    if (!card) {
      card = await this.client.getById(cardId)
      await this.cache.putCard(card)
    }

    const face = card.faces[faceIndex]
    if (!face) {
      throw new Error(`Card ${cardId} has no face at index ${faceIndex}`)
    }

    const png = await renderTextProxy({
      name: face.name,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      ...(face.manaCost ? { manaCost: face.manaCost } : {}),
      ...((face.typeLine ?? card.typeLine) ? { typeLine: face.typeLine ?? card.typeLine } : {}),
      ...(face.oracleText ? { oracleText: face.oracleText } : {}),
      ...(face.power !== undefined ? { power: face.power } : {}),
      ...(face.toughness !== undefined ? { toughness: face.toughness } : {}),
      ...(face.loyalty !== undefined ? { loyalty: face.loyalty } : {})
    })
    return this.cache.writeProxy(cardId, faceIndex, png)
  }
}
