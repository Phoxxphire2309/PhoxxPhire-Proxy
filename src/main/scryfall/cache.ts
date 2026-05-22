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
export class CardCache {
  private readonly cardsDir: string
  private readonly imagesDir: string

  constructor(rootDir: string) {
    this.cardsDir = join(rootDir, 'cards')
    this.imagesDir = join(rootDir, 'images')
  }

  async init(): Promise<void> {
    await mkdir(this.cardsDir, { recursive: true })
    await mkdir(this.imagesDir, { recursive: true })
  }

  private cardPath(id: string): string {
    return join(this.cardsDir, `${sanitize(id)}.json`)
  }

  sourceImagePath(id: string, faceIndex: number): string {
    return join(this.imagesDir, `${sanitize(id)}-${faceIndex}.png`)
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
      return JSON.parse(await readFile(this.cardPath(id), 'utf8')) as Card
    } catch {
      return null
    }
  }

  async hasImage(id: string, faceIndex: number): Promise<boolean> {
    return exists(this.sourceImagePath(id, faceIndex))
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

  /** Atomically write image bytes (temp file + rename) so readers never see a partial. */
  async writeImage(id: string, faceIndex: number, data: Uint8Array): Promise<string> {
    const dest = this.sourceImagePath(id, faceIndex)
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
    await writeFile(tmp, data)
    await rename(tmp, dest)
    return dest
  }
}
