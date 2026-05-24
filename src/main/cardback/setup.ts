import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { dialog, ipcMain } from 'electron'
import sharp from 'sharp'
import { IpcChannel, type CardBackInfo } from '@shared/ipc'
import { squareOffCorners } from '../image/processor'

/** Lets a user supply their own card-back image for duplex printing and exports. */
export interface CardBackManager {
  /** Bytes of the installed custom back (normalised PNG), or null if none. */
  getBytes(): Promise<Uint8Array | null>
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Wires the custom card-back IPC and returns a manager the export layer uses to
 * fetch the back image. The chosen image is normalised to PNG and stored at a
 * fixed path under `userData`, so it persists across launches.
 */
export function initCardBack(userDataDir: string): CardBackManager {
  const backPath = join(userDataDir, 'cardback', 'back.png')

  ipcMain.handle(IpcChannel.CardBackImport, async (): Promise<CardBackInfo> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a card-back image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'] }]
    })
    const file = filePaths[0]
    if (canceled || !file) return { hasCustom: await exists(backPath) }

    await mkdir(dirname(backPath), { recursive: true })
    const png = await sharp(file, { limitInputPixels: false }).png().toBuffer()
    // Square any transparent rounded corners now (with the back's border colour),
    // matching how Scryfall source images are squared on download.
    const squared = await squareOffCorners(new Uint8Array(png))
    await writeFile(backPath, squared)
    return { hasCustom: true }
  })

  ipcMain.handle(
    IpcChannel.CardBackInfo,
    async (): Promise<CardBackInfo> => ({
      hasCustom: await exists(backPath)
    })
  )

  return {
    getBytes: async () => {
      if (!(await exists(backPath))) return null
      return new Uint8Array(await readFile(backPath))
    }
  }
}
