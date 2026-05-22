import { join } from 'node:path'
import { BrowserWindow, ipcMain, net } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { ImportProgress } from '@shared/decklist'
import { CardCache } from './cache'
import { ScryfallClient } from './client'
import { ScryfallService } from './service'

export interface ScryfallSetupOptions {
  /** Electron `userData` directory; the cache lives under `<userData>/cache`. */
  userDataDir: string
  /** App version, embedded in the (required, accurate) Scryfall User-Agent. */
  version: string
}

/**
 * Builds the Scryfall service and wires its renderer-facing IPC channels. The
 * shared `CardCache` is returned so the upscale layer can reuse it. Call after
 * `app.whenReady()`.
 */
export async function initScryfall(
  options: ScryfallSetupOptions
): Promise<{ service: ScryfallService; cache: CardCache }> {
  const client = new ScryfallClient({
    userAgent: `PhoxxPhireProxy/${options.version} (+https://github.com/phoxxphire/proxy)`
  })
  const cache = new CardCache(join(options.userDataDir, 'cache'))
  // Deck-site imports use Electron's Chromium network stack so Cloudflare-fronted
  // APIs (Moxfield) see a real browser request instead of a blocked Node one.
  const service = new ScryfallService(client, cache, fetch, net.fetch as unknown as typeof fetch)
  await service.init()

  ipcMain.handle(IpcChannel.ScryfallSearch, (_event, query: string) => service.search(query))
  ipcMain.handle(IpcChannel.ScryfallAutocomplete, (_event, query: string) =>
    service.autocomplete(query)
  )
  ipcMain.handle(IpcChannel.ScryfallPrints, (_event, oracleId: string) =>
    service.getPrintings(oracleId)
  )
  const broadcastImportProgress = (progress: ImportProgress): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IpcChannel.ScryfallImportProgress, progress)
      }
    }
  }
  ipcMain.handle(IpcChannel.ScryfallResolveDeck, (_event, text: string) =>
    service.resolveDeck(text, broadcastImportProgress)
  )
  ipcMain.handle(IpcChannel.ScryfallImportUrl, (_event, url: string) =>
    service.importDeckUrl(url, broadcastImportProgress)
  )
  ipcMain.handle(IpcChannel.ScryfallFindTokens, (_event, cardIds: string[]) =>
    service.findTokens(cardIds)
  )

  return { service, cache }
}
