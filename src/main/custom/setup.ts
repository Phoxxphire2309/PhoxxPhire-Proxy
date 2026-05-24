import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { dialog, ipcMain } from 'electron'
import sharp from 'sharp'
import { IpcChannel } from '@shared/ipc'
import type { Card } from '@shared/scryfall'
import type { CardCache } from '../scryfall/cache'

function emptyPrices(): Card['prices'] {
  return { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null }
}

/**
 * Lets the user pick an image file and registers it as a "custom card": the
 * image is normalised to PNG and stored as the card's cached source, and a
 * synthetic card record is written so it flows through display, upscaling, and
 * export exactly like a Scryfall card.
 */
export function initCustomCards(cache: CardCache): void {
  ipcMain.handle(IpcChannel.CustomCardImport, async (): Promise<Card | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a card image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'] }]
    })
    const file = filePaths[0]
    if (canceled || !file) return null

    const id = `custom:${randomUUID()}`
    const name = basename(file, extname(file)) || 'Custom card'
    const card: Card = {
      id,
      oracleId: null,
      name,
      setCode: 'custom',
      collectorNumber: '0',
      lang: 'en',
      layout: 'normal',
      faces: [{ name, imageUrl: 'custom' }],
      prices: emptyPrices(),
      relatedTokens: [],
      imageStatus: 'highres_scan'
    }

    const png = await sharp(file, { limitInputPixels: false }).png().toBuffer()
    await cache.writeImage(id, 0, new Uint8Array(png))
    await cache.putCard(card)
    return card
  })
}
