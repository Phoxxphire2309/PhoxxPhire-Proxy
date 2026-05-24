import {
  parseDecklist,
  type DeckLine,
  type DeckResolution,
  type DeckResolvedItem,
  type ImportProgress
} from '@shared/decklist'

type ProgressFn = (progress: ImportProgress) => void
import type { Card, SearchResult } from '@shared/scryfall'
import { squareOffCorners } from '../image/processor'
import { CardCache } from './cache'
import { ScryfallClient } from './client'
import { fetchDeckLines } from './deck-sources'

const IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000

/** Downloads an image into the given face slot of the cache. */
async function downloadImage(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs: number
): Promise<Uint8Array> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(url, { signal: controller.signal })
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

  async search(query: string): Promise<SearchResult> {
    const result = await this.client.search(query)
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
    const cards = await this.client.getPrintings(oracleId)
    await Promise.all(cards.map((card) => this.cache.putCard(card)))
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
  resolveDeck(text: string, onProgress?: ProgressFn): Promise<DeckResolution> {
    return this.resolveLines(parseDecklist(text), onProgress)
  }

  /** Fetch a decklist from a supported site URL and resolve it. */
  async importDeckUrl(url: string, onProgress?: ProgressFn): Promise<DeckResolution> {
    return this.resolveLines(await fetchDeckLines(url, this.deckFetch), onProgress)
  }

  async resolveLines(lines: DeckLine[], onProgress?: ProgressFn): Promise<DeckResolution> {
    const items: DeckResolvedItem[] = []
    const byId = new Map<string, DeckResolvedItem>()
    const errors: string[] = []

    let completed = 0
    for (const line of lines) {
      try {
        const card =
          line.setCode && line.collectorNumber
            ? await this.client.getBySetAndNumber(line.setCode, line.collectorNumber)
            : await this.client.named(line.name, false)
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
      return this.cache.sourceImagePath(cardId, faceIndex)
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

    const data = await downloadImage(face.imageUrl, this.fetchFn, IMAGE_DOWNLOAD_TIMEOUT_MS)
    // Square the transparent rounded corners on download (filled with the card's
    // border colour) so every consumer — preview, upscaler, export — sees a clean
    // rectangular card.
    const squared = await squareOffCorners(data)
    return this.cache.writeImage(cardId, faceIndex, squared)
  }
}
