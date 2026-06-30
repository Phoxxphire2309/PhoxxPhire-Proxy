import type { ImageQuality } from '@shared/scryfall'
import { CardCache } from '../scryfall/cache'
import { downloadImage, looksLikeImage } from '../image/download'

const IMAGE_DOWNLOAD_TIMEOUT_MS = 30_000

/** Direct Google Drive download for the full-resolution file. */
function driveSourceUrl(identifier: string): string {
  return `https://drive.google.com/uc?id=${encodeURIComponent(identifier)}&export=download`
}

/** Google Drive's server-side thumbnail (smaller, fast) for browsing. */
function driveThumbUrl(identifier: string): string {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(identifier)}&sz=w800-h800`
}

/**
 * Namespaces an MPCFill image into the shared image cache so it can't collide
 * with a Scryfall card id (those are UUIDs). Reuses CardCache's face-0 slots,
 * which gives us its atomic writes, LRU eviction and version-wipe for free.
 */
function cacheId(identifier: string): string {
  return `mpcfill__${identifier}`
}

/**
 * Downloads (once) and caches MPCFill card images from Google Drive. Unlike
 * Scryfall scans, these are already full-bleed, square-cornered print files, so
 * they're cached verbatim — no corner squaring.
 */
export class MpcfillService {
  constructor(
    private readonly cache: CardCache,
    private readonly fetchFn: typeof fetch,
    private readonly userAgent: string
  ) {}

  /** Resolves an MPCFill image to a local file path for the given quality. */
  ensureImage(identifier: string, quality: ImageQuality): Promise<string> {
    // MPCFill art is already print-quality; 'upscaled'/'proxy'/'source' all map
    // to the full Drive file, 'thumb' to Drive's smaller server thumbnail.
    return quality === 'thumb' ? this.ensureThumb(identifier) : this.ensureSource(identifier)
  }

  private async ensureSource(identifier: string): Promise<string> {
    const id = cacheId(identifier)
    if (await this.cache.hasImage(id, 0)) return this.cache.sourceImagePath(id, 0)
    const data = await this.download(driveSourceUrl(identifier))
    return this.cache.writeImage(id, 0, data)
  }

  private async ensureThumb(identifier: string): Promise<string> {
    const id = cacheId(identifier)
    if (await this.cache.hasThumb(id, 0)) return this.cache.thumbImagePath(id, 0)
    const data = await this.download(driveThumbUrl(identifier))
    return this.cache.writeThumb(id, 0, data)
  }

  private async download(url: string): Promise<Uint8Array> {
    const data = await downloadImage(url, this.fetchFn, this.userAgent, IMAGE_DOWNLOAD_TIMEOUT_MS)
    // Google Drive answers a download-quota or missing-file request with an HTML
    // page under HTTP 200, so verify we actually got image bytes before caching.
    if (!looksLikeImage(data)) {
      throw new Error('MPCFill image unavailable (Google Drive quota or file removed)')
    }
    return data
  }
}
