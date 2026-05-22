import { rename } from 'node:fs/promises'
import type { UpscaleStatusEvent } from '@shared/ipc'
import type { CardCache } from '../scryfall/cache'
import { DEFAULT_MODEL, DEFAULT_SCALE } from './paths'
import type { Semaphore } from './semaphore'
import type { Upscaler } from './upscaler'

export type StatusEmitter = (event: UpscaleStatusEvent) => void

export interface UpscaleServiceDeps {
  /** The upscaler, or null when the binary is not provisioned. */
  upscaler: Upscaler | null
  cache: CardCache
  semaphore: Semaphore
  /** Ensures the source image is cached, returning its path. */
  ensureSource: (cardId: string, faceIndex: number) => Promise<string>
  emit: StatusEmitter
  /** Post-process the raw PNG into the cache (e.g. downscale + JPEG). Defaults to a rename. */
  finalize?: (tmpPath: string, destPath: string, scale: number) => Promise<void>
  model?: string
  scale?: number
}

/**
 * Turns a card face into an upscaled PNG, exactly once. Results are cached on
 * disk keyed by (id, face, model, scale); concurrent requests for the same face
 * share a single in-flight job, and the whole pipeline is gated by a semaphore
 * so we never run more GPU jobs than configured.
 */
export class UpscaleService {
  private readonly inFlight = new Map<string, Promise<string>>()
  private readonly finalize: (tmpPath: string, destPath: string, scale: number) => Promise<void>
  private upscaler: Upscaler | null
  private model: string
  private scale: number

  constructor(private readonly deps: UpscaleServiceDeps) {
    this.model = deps.model ?? DEFAULT_MODEL
    this.scale = deps.scale ?? DEFAULT_SCALE
    this.finalize = deps.finalize ?? ((tmpPath, destPath) => rename(tmpPath, destPath))
    this.upscaler = deps.upscaler
  }

  available(): boolean {
    return this.upscaler !== null
  }

  /** Swap in a freshly-installed upscaler (after a one-click install). */
  setUpscaler(upscaler: Upscaler): void {
    this.upscaler = upscaler
  }

  getSettings(): { model: string; scale: number; available: boolean } {
    return { model: this.model, scale: this.scale, available: this.available() }
  }

  /** Updates the active model/scale. Cache keys include both, so variants coexist. */
  setSettings(settings: { model?: string; scale?: number }): void {
    if (settings.model) this.model = settings.model
    if (settings.scale && settings.scale > 0) this.scale = settings.scale
  }

  /** Path to the upscaled image for a face, producing it on first request. */
  ensureUpscaled(cardId: string, faceIndex: number): Promise<string> {
    const { cache } = this.deps
    const upscaler = this.upscaler
    if (!upscaler) {
      return Promise.reject(new Error('Upscaler is not available'))
    }

    // Capture current settings so a mid-flight settings change can't desync the
    // output path from the args we run with.
    const model = this.model
    const scale = this.scale
    const dest = cache.upscaledImagePath(cardId, faceIndex, model, scale)

    // The in-flight key is the destination path (id + face + model + scale), and
    // it is registered synchronously — before any `await` — so two simultaneous
    // requests for the same face can never both launch a GPU process.
    const existing = this.inFlight.get(dest)
    if (existing) return existing

    const job = (async () => {
      if (await cache.fileExists(dest)) return dest
      return this.runJob(cardId, faceIndex, dest, upscaler, model, scale)
    })().finally(() => this.inFlight.delete(dest))

    this.inFlight.set(dest, job)
    return job
  }

  private async runJob(
    cardId: string,
    faceIndex: number,
    dest: string,
    upscaler: Upscaler,
    model: string,
    scale: number
  ): Promise<string> {
    this.emit(cardId, faceIndex, 'queued')
    try {
      return await this.deps.semaphore.run(async () => {
        this.emit(cardId, faceIndex, 'upscaling')
        const source = await this.deps.ensureSource(cardId, faceIndex)
        const tmp = `${dest}.tmp-${process.pid}-${Date.now()}.png`
        // Always run the binary at 4× (its -s 2 path corrupts output); the
        // finalize step downscales to the requested effective scale.
        await upscaler.run({ inputPath: source, outputPath: tmp, model, scale: 4 })
        await this.finalize(tmp, dest, scale)
        this.emit(cardId, faceIndex, 'ready')
        return dest
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upscale failed'
      this.deps.emit({ cardId, faceIndex, status: 'failed', error: message })
      throw error
    }
  }

  private emit(cardId: string, faceIndex: number, status: UpscaleStatusEvent['status']): void {
    this.deps.emit({ cardId, faceIndex, status })
  }
}
