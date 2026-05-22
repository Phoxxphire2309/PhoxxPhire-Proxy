import type { Card, ScryfallCard, ScryfallList, SearchResult } from '@shared/scryfall'
import { RateLimiter } from './rate-limiter'
import { normalizeCard } from './normalize'

const DEFAULT_BASE_URL = 'https://api.scryfall.com'
// Scryfall requires an Accept header; a weighted wildcard is explicitly allowed.
const ACCEPT = 'application/json;q=0.9,*/*;q=0.8'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_RETRIES = 2
const MAX_BACKOFF_MS = 8_000

export interface ScryfallClientOptions {
  /** Required, accurate User-Agent (Scryfall rejects generic/library agents). */
  userAgent: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  limiter?: RateLimiter
  fetchFn?: typeof fetch
  sleepFn?: (ms: number) => Promise<void>
}

export class ScryfallError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ScryfallError'
  }
}

export class ScryfallClient {
  private readonly userAgent: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly limiter: RateLimiter
  private readonly fetchFn: typeof fetch
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(options: ScryfallClientOptions) {
    this.userAgent = options.userAgent
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.limiter = options.limiter ?? new RateLimiter(100)
    this.fetchFn = options.fetchFn ?? fetch
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /** Full-text search. A Scryfall 404 (no matches) is mapped to an empty result. */
  async search(query: string): Promise<SearchResult> {
    try {
      const list = await this.request<ScryfallList<ScryfallCard>>('/cards/search', {
        q: query,
        unique: 'cards',
        include_extras: 'false'
      })
      return {
        cards: list.data.map(normalizeCard).filter((card) => card.faces.length > 0),
        totalCards: list.total_cards ?? list.data.length,
        hasMore: list.has_more
      }
    } catch (error) {
      if (error instanceof ScryfallError && error.status === 404) {
        return { cards: [], totalCards: 0, hasMore: false }
      }
      throw error
    }
  }

  /** Resolve a card by name (fuzzy by default, exact when requested). */
  async named(name: string, exact = false): Promise<Card> {
    const raw = await this.request<ScryfallCard>(
      '/cards/named',
      exact ? { exact: name } : { fuzzy: name }
    )
    return normalizeCard(raw)
  }

  /**
   * Every printing of a card, identified by its oracle id, ordered by release.
   * `unique: 'prints'` is what surfaces the per-set art/version variants.
   */
  async getPrintings(oracleId: string): Promise<Card[]> {
    if (!oracleId) return []
    try {
      const list = await this.request<ScryfallList<ScryfallCard>>('/cards/search', {
        q: `oracleid:${oracleId}`,
        unique: 'prints',
        order: 'released',
        dir: 'asc'
      })
      return list.data.map(normalizeCard).filter((card) => card.faces.length > 0)
    } catch (error) {
      if (error instanceof ScryfallError && error.status === 404) return []
      throw error
    }
  }

  /** Card-name autocomplete suggestions. */
  async autocomplete(query: string): Promise<string[]> {
    if (!query.trim()) return []
    const result = await this.request<{ data: string[] }>('/cards/autocomplete', { q: query })
    return result.data
  }

  /** Fetch a single card by its Scryfall id. */
  async getById(id: string): Promise<Card> {
    const raw = await this.request<ScryfallCard>(`/cards/${encodeURIComponent(id)}`)
    return normalizeCard(raw)
  }

  /** Fetch a specific printing by set code + collector number. */
  async getBySetAndNumber(setCode: string, collectorNumber: string): Promise<Card> {
    const raw = await this.request<ScryfallCard>(
      `/cards/${encodeURIComponent(setCode.toLowerCase())}/${encodeURIComponent(collectorNumber)}`
    )
    return normalizeCard(raw)
  }

  private buildUrl(path: string, params?: Record<string, string>): URL {
    const url = new URL(path, this.baseUrl)
    if (params) {
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    }
    return url
  }

  private backoffMs(attempt: number): number {
    return Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1))
  }

  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params)
    let attempt = 0

    for (;;) {
      await this.limiter.acquire()

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      let response: Response
      try {
        response = await this.fetchFn(url, {
          headers: { 'User-Agent': this.userAgent, Accept: ACCEPT },
          signal: controller.signal
        })
      } catch (error) {
        clearTimeout(timer)
        if (attempt < this.maxRetries) {
          attempt += 1
          await this.sleepFn(this.backoffMs(attempt))
          continue
        }
        const reason = error instanceof Error ? error.message : 'unknown error'
        throw new ScryfallError(`Network error contacting Scryfall: ${reason}`, 0)
      } finally {
        clearTimeout(timer)
      }

      // Retry transient failures (rate limiting, server errors) with backoff.
      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        attempt += 1
        const retryAfter = Number(response.headers.get('retry-after'))
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : this.backoffMs(attempt)
        await this.sleepFn(waitMs)
        continue
      }

      if (!response.ok) {
        throw new ScryfallError(
          `Scryfall request failed (HTTP ${response.status})`,
          response.status
        )
      }

      return (await response.json()) as T
    }
  }
}
