import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpscaleStatusEvent } from '@shared/ipc'
import { CardCache } from '../scryfall/cache'
import { Semaphore } from './semaphore'
import { UpscaleService } from './service'
import type { Upscaler } from './upscaler'

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** A fake upscaler whose run() just writes placeholder bytes to the output path. */
function writingUpscaler(impl?: Upscaler['run']): Upscaler {
  return {
    run:
      impl ??
      (async ({ outputPath }) => {
        await writeFile(outputPath, Buffer.from('UPSCALED'))
      })
  } as unknown as Upscaler
}

describe('UpscaleService', () => {
  let dir: string
  let cache: CardCache

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-upscale-'))
    cache = new CardCache(dir)
    await cache.init()
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports unavailable and refuses to upscale without a binary', async () => {
    const service = new UpscaleService({
      upscaler: null,
      cache,
      semaphore: new Semaphore(1),
      ensureSource: async () => 'src.png',
      emit: () => {}
    })
    expect(service.available()).toBe(false)
    await expect(service.ensureUpscaled('id', 0)).rejects.toThrow(/not available/)
  })

  it('produces, caches, and emits a queued → upscaling → ready sequence', async () => {
    const events: UpscaleStatusEvent[] = []
    const run = vi.fn<Upscaler['run']>(async ({ outputPath }) => {
      await writeFile(outputPath, Buffer.from('UPSCALED'))
    })
    const service = new UpscaleService({
      upscaler: writingUpscaler(run),
      cache,
      semaphore: new Semaphore(2),
      ensureSource: async () => 'source.png',
      emit: (event) => events.push(event)
    })

    const dest = await service.ensureUpscaled('id-1', 0)
    expect(await readFile(dest, 'utf8')).toBe('UPSCALED')
    expect(events.map((e) => e.status)).toEqual(['queued', 'upscaling', 'ready'])

    // A second request is served from cache without re-running the binary.
    await service.ensureUpscaled('id-1', 0)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent requests for the same face into one job', async () => {
    const gate = deferred()
    const run = vi.fn<Upscaler['run']>(async ({ outputPath }) => {
      await gate.promise
      await writeFile(outputPath, Buffer.from('UPSCALED'))
    })
    const service = new UpscaleService({
      upscaler: writingUpscaler(run),
      cache,
      semaphore: new Semaphore(2),
      ensureSource: async () => 'source.png',
      emit: () => {}
    })

    const first = service.ensureUpscaled('id-2', 0)
    const second = service.ensureUpscaled('id-2', 0)
    gate.resolve()
    await Promise.all([first, second])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('emits a failed status and rethrows when the upscaler errors', async () => {
    const events: UpscaleStatusEvent[] = []
    const service = new UpscaleService({
      upscaler: writingUpscaler(async () => {
        throw new Error('vulkan exploded')
      }),
      cache,
      semaphore: new Semaphore(1),
      ensureSource: async () => 'source.png',
      emit: (event) => events.push(event)
    })

    await expect(service.ensureUpscaled('id-3', 0)).rejects.toThrow('vulkan exploded')
    const failure = events.find((e) => e.status === 'failed')
    expect(failure?.error).toContain('vulkan exploded')
  })
})
