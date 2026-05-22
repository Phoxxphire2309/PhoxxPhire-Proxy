import { access } from 'node:fs/promises'
import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannel, type UpscaleStatusEvent } from '@shared/ipc'
import type { CardCache } from '../scryfall/cache'
import type { ScryfallService } from '../scryfall/service'
import { finalizeUpscaled } from '../image/processor'
import { binaryPath, modelsDir, type VendorLocation } from './paths'
import { Semaphore } from './semaphore'
import { UpscaleService } from './service'
import { Upscaler } from './upscaler'

// Real-ESRGAN is GPU-bound and running two ncnn/Vulkan processes at once can
// corrupt each other's tile memory (garbled output), so we run strictly one
// at a time. This is also barely slower since the GPU is the bottleneck.
const MAX_CONCURRENT_UPSCALES = 1

/** Soft ceiling for the on-disk image cache; least-recently-used files evict past this. */
const MAX_CACHE_BYTES = 1_000_000_000

export interface UpscaleSetupOptions {
  location: VendorLocation
  cache: CardCache
  scryfall: ScryfallService
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Pushes a status event to every open renderer window. */
function broadcastStatus(event: UpscaleStatusEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.UpscaleStatus, event)
    }
  }
}

/**
 * Builds the upscale service if the Real-ESRGAN binary is present, wires its IPC
 * channels, and returns it. When the binary is missing the service still exists
 * but reports itself unavailable, so the protocol layer can fall back to source
 * images and the app keeps working.
 */
export async function initUpscale(options: UpscaleSetupOptions): Promise<UpscaleService> {
  const binary = binaryPath(options.location)
  const present = await fileExists(binary)

  const upscaler = present
    ? new Upscaler({ binaryPath: binary, modelsDir: modelsDir(options.location) })
    : null

  const service = new UpscaleService({
    upscaler,
    cache: options.cache,
    semaphore: new Semaphore(MAX_CONCURRENT_UPSCALES),
    ensureSource: (cardId, faceIndex) => options.scryfall.ensureFaceImage(cardId, faceIndex),
    finalize: async (tmpPath, destPath, scale) => {
      await finalizeUpscaled(tmpPath, destPath, scale)
      await options.cache.enforceImageLimit(MAX_CACHE_BYTES)
    },
    emit: broadcastStatus
  })

  ipcMain.handle(IpcChannel.UpscaleAvailable, () => service.available())
  ipcMain.handle(IpcChannel.UpscaleGetSettings, () => service.getSettings())
  ipcMain.handle(
    IpcChannel.UpscaleSetSettings,
    (_event, settings: { model: string; scale: number }) => {
      service.setSettings(settings)
      return service.getSettings()
    }
  )
  ipcMain.handle(IpcChannel.CacheInfo, async () => ({ bytes: await options.cache.sizeBytes() }))
  ipcMain.handle(IpcChannel.CacheClear, async () => {
    await options.cache.clear()
    return { bytes: await options.cache.sizeBytes() }
  })

  return service
}
