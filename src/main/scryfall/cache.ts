import { access, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Card } from '@shared/scryfall'

/** Scryfall ids are UUIDs, but sanitise before using them as file names anyway. */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Total size in bytes of all files directly inside `dir` (non-recursive is enough here). */
async function dirSize(dir: string): Promise<number> {
  let total = 0
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return 0
  }
  for (const entry of entries) {
    try {
      total += (await stat(join(dir, entry))).size
    } catch {
      // Ignore files that vanish between listing and stat.
    }
  }
  return total
}

/**
 * On-disk cache for normalized card metadata and downloaded source images.
 * Metadata is stored as JSON keyed by card id; images live alongside, named by
 * card id + face index. Phase 2 adds upscaled variants in the same image dir.
 */
/**
 * Bumped whenever cached image processing changes (e.g. corner squaring), so
 * stale images are dropped once and re-fetched / re-upscaled with current logic.
 */
const IMAGE_CACHE_VERSION = 5

export class CardCache {
  readonly rootDir: string
  private readonly cardsDir: string
  private readonly imagesDir: string
  private readonly versionFile: string

  constructor(rootDir: string) {
    this.rootDir = rootDir
    this.cardsDir = join(rootDir, 'cards')
    this.imagesDir = join(rootDir, 'images')
    this.versionFile = join(rootDir, 'image-cache-version')
  }

  async init(): Promise<void> {
    await mkdir(this.cardsDir, { recursive: true })
    await this.migrateImages()
    await mkdir(this.imagesDir, { recursive: true })
  }

  /** Drops the image cache once when the processing version changes. */
  private async migrateImages(): Promise<void> {
    let current = ''
    try {
      current = await readFile(this.versionFile, 'utf8')
    } catch {
      // No version file yet — treat as outdated.
    }
    if (current === String(IMAGE_CACHE_VERSION)) return
    await rm(this.imagesDir, { recursive: true, force: true })
    await mkdir(this.imagesDir, { recursive: true })
    await writeFile(this.versionFile, String(IMAGE_CACHE_VERSION), 'utf8')
  }

  private cardPath(id: string): string {
    return join(this.cardsDir, `${sanitize(id)}.json`)
  }

  sourceImagePath(id: string, faceIndex: number): string {
    return join(this.imagesDir, `${sanitize(id)}-${faceIndex}.png`)
  }

  /** Browsing thumbnail path (medium JPEG); much smaller than the source PNG. */
  thumbImagePath(id: string, faceIndex: number): string {
    return join(this.imagesDir, `${sanitize(id)}-${faceIndex}-thumb.jpg`)
  }

  /** Rendered text-proxy path (PNG). */
  proxyImagePath(id: string, faceIndex: number): string {
    return join(this.imagesDir, `${sanitize(id)}-${faceIndex}-proxy.png`)
  }

  /** Upscaled variant path (JPEG), keyed by model + scale so settings coexist. */
  upscaledImagePath(id: string, faceIndex: number, model: string, scale: number): string {
    return join(this.imagesDir, `${sanitize(id)}-${faceIndex}-${sanitize(model)}-x${scale}.jpg`)
  }

  async putCard(card: Card): Promise<void> {
    await writeFile(this.cardPath(card.id), JSON.stringify(card), 'utf8')
  }

  async getCard(id: string): Promise<Card | null> {
    try {
      const card = JSON.parse(await readFile(this.cardPath(id), 'utf8')) as Card
      // Default fields added after a card was first cached, so older entries
      // (written by a previous version) stay safe to consume.
      if (!Array.isArray(card.relatedTokens)) card.relatedTokens = []
      return card
    } catch {
      return null
    }
  }

  async hasImage(id: string, faceIndex: number): Promise<boolean> {
    return exists(this.sourceImagePath(id, faceIndex))
  }

  async hasThumb(id: string, faceIndex: number): Promise<boolean> {
    return exists(this.thumbImagePath(id, faceIndex))
  }

  async hasProxy(id: string, faceIndex: number): Promise<boolean> {
    return exists(this.proxyImagePath(id, faceIndex))
  }

  /** Whether an arbitrary cache file (e.g. an upscaled variant) exists. */
  fileExists(path: string): Promise<boolean> {
    return exists(path)
  }

  /** Total bytes used by cached metadata + images. */
  async sizeBytes(): Promise<number> {
    const [cards, images] = await Promise.all([dirSize(this.cardsDir), dirSize(this.imagesDir)])
    return cards + images
  }

  /**
   * Evicts least-recently-modified images until the images directory is within
   * `maxBytes`. Keeps the cache from growing without bound.
   */
  async enforceImageLimit(maxBytes: number): Promise<void> {
    let entries: string[]
    try {
      entries = await readdir(this.imagesDir)
    } catch {
      return
    }

    const files = (
      await Promise.all(
        entries.map(async (name) => {
          try {
            const info = await stat(join(this.imagesDir, name))
            return { path: join(this.imagesDir, name), size: info.size, mtime: info.mtimeMs }
          } catch {
            return null
          }
        })
      )
    ).filter((file): file is { path: string; size: number; mtime: number } => file !== null)

    let total = files.reduce((sum, file) => sum + file.size, 0)
    if (total <= maxBytes) return

    files.sort((a, b) => a.mtime - b.mtime) // oldest first
    for (const file of files) {
      if (total <= maxBytes) break
      try {
        await rm(file.path, { force: true })
        total -= file.size
      } catch {
        // Ignore files that can't be removed.
      }
    }
  }

  /** Remove all cached metadata + images, leaving empty (recreated) directories. */
  async clear(): Promise<void> {
    await Promise.all([
      rm(this.cardsDir, { recursive: true, force: true }),
      rm(this.imagesDir, { recursive: true, force: true })
    ])
    await this.init()
  }

  /**
   * Removes only the cached images, keeping card metadata. They re-download and
   * re-process with the current image logic on next use — so corner/bleed fixes
   * apply without losing your searched cards or needing an app restart.
   */
  async clearImages(): Promise<void> {
    await rm(this.imagesDir, { recursive: true, force: true })
    await mkdir(this.imagesDir, { recursive: true })
  }

  /** Atomically write image bytes (temp file + rename) so readers never see a partial. */
  async writeImage(id: string, faceIndex: number, data: Uint8Array): Promise<string> {
    const dest = this.sourceImagePath(id, faceIndex)
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, data)
    await rename(tmp, dest)
    return dest
  }

  /** Atomically write a browsing thumbnail (JPEG). */
  async writeThumb(id: string, faceIndex: number, data: Uint8Array): Promise<string> {
    const dest = this.thumbImagePath(id, faceIndex)
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, data)
    await rename(tmp, dest)
    return dest
  }

  /** Atomically write a rendered text proxy (PNG). */
  async writeProxy(id: string, faceIndex: number, data: Uint8Array): Promise<string> {
    const dest = this.proxyImagePath(id, faceIndex)
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, data)
    await rename(tmp, dest)
    return dest
  }
}
