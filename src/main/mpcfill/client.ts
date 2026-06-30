import type { MpcfillCardType, MpcfillImage } from '@shared/mpcfill'
import { RateLimiter } from '../scryfall/rate-limiter'

const DEFAULT_BASE_URL = 'https://mpcfill.com'
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_MAX_RETRIES = 2
const MAX_BACKOFF_MS = 8_000
/** Cap the options shown per card so the picker (and the /2/cards/ call) stay small. */
const MAX_RESULTS = 60

/** Permissive search filters — we do our own ranking/limiting, so don't exclude. */
const FILTER_SETTINGS = {
  excludesTags: [] as string[],
  includesTags: [] as string[],
  languages: [] as string[],
  maximumDPI: 1500,
  maximumSize: 1000,
  minimumDPI: 0
}

interface CardDocument {
  identifier: string
  name: string
  sourceName?: string
  source?: string
  dpi?: number
  extension?: string
}

export interface MpcfillClientOptions {
  /** Accurate, descriptive User-Agent (good API citizenship). */
  userAgent: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  limiter?: RateLimiter
  fetchFn?: typeof fetch
  sleepFn?: (ms: number) => Promise<void>
}

export class MpcfillError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'MpcfillError'
  }
}

/**
 * Talks to the MPC Autofill backend (mpcfill.com). The flow mirrors its own
 * editor: `editorSearch` turns a card name into a ranked list of Drive file ids,
 * then `cards` resolves those ids to displayable image metadata.
 */
export class MpcfillClient {
  private readonly baseUrl: string
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly maxRetries: number
  private readonly limiter: RateLimiter
  private readonly fetchFn: typeof fetch
  private readonly sleepFn: (ms: number) => Promise<void>
  /** Source primary keys, fetched once and reused to build search settings. */
  private sourcePks: number[] | null = null

  constructor(options: MpcfillClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL
    this.userAgent = options.userAgent
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    // mpcfill.com is a small community service — be gentle (~5 req/s).
    this.limiter = options.limiter ?? new RateLimiter(200)
    this.fetchFn = options.fetchFn ?? fetch
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  /** Searches MPCFill for a card name and returns ranked image options. */
  async searchImages(query: string, cardType: MpcfillCardType = 'CARD'): Promise<MpcfillImage[]> {
    const trimmed = query.trim()
    if (!trimmed) return []
    const identifiers = (await this.editorSearch(trimmed, cardType)).slice(0, MAX_RESULTS)
    if (identifiers.length === 0) return []
    const docs = await this.getCards(identifiers)
    // Preserve MPCFill's ranking order (getCards returns an unordered map).
    return identifiers
      .map((id) => docs.get(id))
      .filter((doc): doc is CardDocument => doc !== undefined)
      .map((doc) => ({
        identifier: doc.identifier,
        name: doc.name,
        source: doc.sourceName ?? doc.source ?? 'Unknown',
        dpi: doc.dpi ?? 0,
        extension: doc.extension ?? 'png'
      }))
  }

  private async editorSearch(query: string, cardType: MpcfillCardType): Promise<string[]> {
    const sources = await this.getSourcePks()
    const body = {
      searchSettings: {
        filterSettings: FILTER_SETTINGS,
        // Exact name match: fuzzy search returns every card *containing* the
        // query (e.g. "Blood" → 1000+ "blood…" cards) instead of the card itself.
        searchTypeSettings: { filterCardbacks: false, fuzzySearch: false },
        sourceSettings: { sources: sources.map((pk) => [pk, true] as [number, boolean]) }
      },
      queries: [{ query, cardType }]
    }
    const json = await this.post('/2/editorSearch/', body)
    const results = (json as { results?: Record<string, Record<string, string[]>> }).results ?? {}
    const firstQuery = Object.values(results)[0] ?? {}
    return Array.isArray(firstQuery[cardType]) ? firstQuery[cardType] : []
  }

  private async getCards(identifiers: string[]): Promise<Map<string, CardDocument>> {
    const json = await this.post('/2/cards/', { cardIdentifiers: identifiers })
    const results = (json as { results?: Record<string, CardDocument> }).results ?? {}
    return new Map(Object.entries(results))
  }

  private async getSourcePks(): Promise<number[]> {
    if (this.sourcePks) return this.sourcePks
    const json = await this.get('/2/sources/')
    const results = (json as { results?: Record<string, unknown> }).results ?? {}
    this.sourcePks = Object.keys(results)
      .map((key) => Number(key))
      .filter((pk) => Number.isFinite(pk))
    return this.sourcePks
  }

  private get(path: string): Promise<unknown> {
    return this.request(path, { method: 'GET' })
  }

  private post(path: string, body: unknown): Promise<unknown> {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    })
  }

  private backoffMs(attempt: number): number {
    return Math.min(MAX_BACKOFF_MS, 500 * 2 ** (attempt - 1))
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    let attempt = 0
    for (;;) {
      await this.limiter.acquire()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      try {
        const response = await this.fetchFn(url, {
          ...init,
          signal: controller.signal,
          headers: { ...init.headers, 'User-Agent': this.userAgent, Accept: 'application/json' }
        })
        if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
          attempt += 1
          const retryAfter = Number(response.headers.get('retry-after'))
          const waitMs =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoffMs(attempt)
          clearTimeout(timer)
          await this.sleepFn(waitMs)
          continue
        }
        if (!response.ok) {
          throw new MpcfillError(`MPCFill request failed (HTTP ${response.status})`, response.status)
        }
        return await response.json()
      } catch (error) {
        if (error instanceof MpcfillError) throw error
        if (attempt < this.maxRetries) {
          attempt += 1
          clearTimeout(timer)
          await this.sleepFn(this.backoffMs(attempt))
          continue
        }
        const reason = error instanceof Error ? error.message : 'network error'
        throw new MpcfillError(`MPCFill request failed (${reason})`, 0)
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
