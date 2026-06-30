import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { MpcfillCardType } from '@shared/mpcfill'
import type { CardCache } from '../scryfall/cache'
import { MpcfillClient } from './client'
import { MpcfillService } from './service'

export interface MpcfillSetupOptions {
  /** Shared image/metadata cache (reused from the Scryfall setup). */
  cache: CardCache
  /** App version, embedded in the descriptive User-Agent. */
  version: string
  /**
   * Network stack for both the mpcfill.com API and Google Drive downloads —
   * Electron's `net.fetch`, which behaves like a browser (redirects, cookies)
   * that Google Drive expects.
   */
  fetchFn: typeof fetch
}

/**
 * Builds the MPCFill client + image service and wires its search IPC channel.
 * The returned service is handed to the image protocol so `phoxx-image://mpcfill`
 * requests resolve to cached Google Drive downloads. Call after `app.whenReady()`.
 */
export function initMpcfill(options: MpcfillSetupOptions): { service: MpcfillService } {
  const userAgent = `PhoxxPhireProxy/${options.version} (+https://github.com/phoxxphire/proxy)`
  const client = new MpcfillClient({ userAgent, fetchFn: options.fetchFn })
  const service = new MpcfillService(options.cache, options.fetchFn, userAgent)

  ipcMain.handle(IpcChannel.MpcfillSearch, (_event, name: string, cardType?: MpcfillCardType) =>
    client.searchImages(name, cardType)
  )

  return { service }
}
