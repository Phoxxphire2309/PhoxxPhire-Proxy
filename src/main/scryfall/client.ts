import type {
  Card,
  ScryfallCard,
  ScryfallList,
  SearchOptions,
  SearchResult
} from '@shared/scryfall'
import { RateLimiter } from './rate-limiter'
import { normalizeCard } from './normalize'

const DEFAULT_BASE_URL = 'https://api.scryfall.com'
// Scryfall requires an Accept header; a weighted wildcard is explicitly allowed.
const ACCEPT = 'application/json;q=0.9,*/*;q=0.8'
const DEFAULT_TIMEOUT_MS = 15_000
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

  /**
   * The accurate User-Agent Scryfall requires. Exposed so the image-download
   * path (which fetches from `cards.scryfall.io` directly, not through this
   * client) can send the same identity — Scryfall's CDN rejects generic agents
   * such as Node's default `node` with HTTP 400.
   */
  get scryfallUserAgent(): string {
    return this.userAgent
  }

  /** Full-text search. A Scryfall 404 (no matches) is mapped to an empty result. */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    try {
      const params: Record<string, string> = {
        q: query,
        unique: 'cards',
        include_extras: 'false'
      }
      if (options.order) params.order = options.order
      if (options.dir) params.dir = options.dir
      if (options.page && options.page > 1) params.page = String(options.page)
      const list = await this.request<ScryfallList<ScryfallCard>>('/cards/search', params)
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
   *
   * Scryfall returns at most 175 results per page, so high-printing cards (basic
   * lands, staples) need their pages followed via `has_more` — otherwise later
   * sets go missing. Capped to keep the most prolific basics bounded.
   */
  async getPrintings(oracleId: string): Promise<Card[]> {
    if (!oracleId) return []
    const MAX_PAGES = 20
    const raw: ScryfallCard[] = []
    try {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const params: Record<string, string> = {
          q: `oracleid:${oracleId}`,
          unique: 'prints',
          order: 'released',
          dir: 'asc'
        }
        if (page > 1) params.page = String(page)
        const list = await this.request<ScryfallList<ScryfallCard>>('/cards/search', params)
        raw.push(...list.data)
        if (!list.has_more) break
      }
      return raw.map(normalizeCard).filter((card) => card.faces.length > 0)
    } catch (error) {
      if (error instanceof ScryfallError && error.status === 404) return []
      throw error
    }
  }

  /** Card-name autocomplete suggestions. Best-effort: failures yield no suggestions. */
  async autocomplete(query: string): Promise<string[]> {
    if (!query.trim()) return []
    try {
      const result = await this.request<{ data: string[] }>('/cards/autocomplete', { q: query })
      return result.data
    } catch {
      return []
    }
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

  /** Fetch the same printing in a specific language (e.g. 'de', 'fr', 'ja'); 404s if not localised. */
  async getLocalized(setCode: string, collectorNumber: string, lang: string): Promise<Card> {
    const raw = await this.request<ScryfallCard>(
      `/cards/${encodeURIComponent(setCode.toLowerCase())}/` +
        `${encodeURIComponent(collectorNumber)}/${encodeURIComponent(lang.toLowerCase())}`
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
      // The timeout must cover reading the body too: fetch() resolves as soon as
      // the headers arrive, so a stalled response body would otherwise hang the
      // call forever. Keeping the timer until after response.json() lets the
      // abort signal tear down a stuck stream, surfacing as a retry/timeout.
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      try {
        const response = await this.fetchFn(url, {
          headers: { 'User-Agent': this.userAgent, Accept: ACCEPT },
          signal: controller.signal
        })

        // Retry transient failures (rate limiting, server errors) with backoff.
        if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
          attempt += 1
          const retryAfter = Number(response.headers.get('retry-after'))
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : this.backoffMs(attempt)
          clearTimeout(timer)
          await this.sleepFn(waitMs)
          continue
        }

        if (!response.ok) {
          const message =
            response.status >= 500
              ? `Scryfall is temporarily unavailable (HTTP ${response.status}) — try again shortly.`
              : `Scryfall request failed (HTTP ${response.status})`
          throw new ScryfallError(message, response.status)
        }

        return (await response.json()) as T
      } catch (error) {
        // A definitive HTTP error (e.g. 4xx) shouldn't be retried as if transient.
        if (error instanceof ScryfallError) throw error
        // `controller.signal.aborted` is only ever set by our own timeout timer.
        const timedOut = controller.signal.aborted
        if (attempt < this.maxRetries) {
          attempt += 1
          await this.sleepFn(this.backoffMs(attempt))
          continue
        }
        if (timedOut) {
          throw new ScryfallError(
            `Scryfall didn't respond within ${Math.round(this.timeoutMs / 1000)}s — check your connection and try again.`,
            0
          )
        }
        const reason = error instanceof Error ? error.message : 'unknown error'
        throw new ScryfallError(`Network error contacting Scryfall: ${reason}`, 0)
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
