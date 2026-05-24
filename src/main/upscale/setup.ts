import { BrowserWindow, ipcMain } from 'electron'
import { IpcChannel, type UpscaleStatusEvent } from '@shared/ipc'
import type { InstallPhase } from '@shared/upscaleInstall'
import type { CardCache } from '../scryfall/cache'
import type { ScryfallService } from '../scryfall/service'
import { finalizeUpscaled } from '../image/processor'
import { installUpscaler } from './installer'
import { installVendorDir, resolveVendor, type VendorLocation } from './paths'
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

/** Pushes a status event to every open renderer window. */
function broadcastStatus(event: UpscaleStatusEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.UpscaleStatus, event)
    }
  }
}

function broadcastInstallPhase(phase: InstallPhase): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.UpscaleInstallProgress, phase)
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
  const resolved = await resolveVendor(options.location)
  const upscaler = resolved
    ? new Upscaler({ binaryPath: resolved.binary, modelsDir: resolved.models })
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
  ipcMain.handle(IpcChannel.CacheInfo, async () => ({
    bytes: await options.cache.sizeBytes(),
    path: options.cache.rootDir
  }))
  ipcMain.handle(IpcChannel.CacheClear, async () => {
    await options.cache.clear()
    return { bytes: await options.cache.sizeBytes(), path: options.cache.rootDir }
  })
  ipcMain.handle(IpcChannel.CacheRebuildImages, async () => {
    await options.cache.clearImages()
    return { bytes: await options.cache.sizeBytes(), path: options.cache.rootDir }
  })

  ipcMain.handle(IpcChannel.UpscaleInstall, async () => {
    await installUpscaler(installVendorDir(options.location), broadcastInstallPhase)
    const installed = await resolveVendor(options.location)
    if (!installed) {
      throw new Error('Install finished but the upscaler binary could not be located.')
    }
    service.setUpscaler(new Upscaler({ binaryPath: installed.binary, modelsDir: installed.models }))
    return service.getSettings()
  })

  return service
}
