import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { dialog, ipcMain } from 'electron'
import sharp from 'sharp'
import { IpcChannel, type CardBackEntry, type CardBackLibrary } from '@shared/ipc'
import { squareOffCorners } from '../image/processor'

/** Lets a user keep a library of card-back images and pick one for duplex prints. */
export interface CardBackManager {
  /** Bytes of the selected custom back (normalised PNG), or null if none. */
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
 * Wires the card-back library IPC and returns a manager the export layer uses to
 * fetch the selected back. Images are normalised to PNG and stored under
 * `userData/cardback/<id>.png`, with a `library.json` index recording their
 * names and which one is selected — so the library persists across launches.
 */
export function initCardBack(userDataDir: string): CardBackManager {
  const dir = join(userDataDir, 'cardback')
  const indexPath = join(dir, 'library.json')
  const imagePath = (id: string): string => join(dir, `${id}.png`)
  const legacyPath = join(dir, 'back.png') // the single back from before the library

  const loadLibrary = async (): Promise<CardBackLibrary> => {
    try {
      const parsed = JSON.parse(await readFile(indexPath, 'utf8')) as CardBackLibrary
      if (Array.isArray(parsed.backs)) return parsed
    } catch {
      // No (valid) index yet.
    }
    // Migrate a pre-library single back into the new library, once.
    if (await exists(legacyPath)) {
      const id = `back-${Date.now()}`
      await rename(legacyPath, imagePath(id)).catch(() => {})
      const migrated: CardBackLibrary = { backs: [{ id, name: 'My card back' }], selectedId: id }
      await saveLibrary(migrated)
      return migrated
    }
    return { backs: [], selectedId: null }
  }

  const saveLibrary = async (library: CardBackLibrary): Promise<void> => {
    await mkdir(dir, { recursive: true })
    await writeFile(indexPath, JSON.stringify(library, null, 2), 'utf8')
  }

  /** A readable, unique-ish name from a file path, falling back to a default. */
  const nameFromFile = (file: string, existing: CardBackEntry[]): string => {
    const base = basename(file, extname(file)).trim() || 'Card back'
    let name = base
    for (let n = 2; existing.some((entry) => entry.name === name); n += 1) name = `${base} (${n})`
    return name
  }

  ipcMain.handle(IpcChannel.CardBackImport, async (): Promise<CardBackLibrary> => {
    const library = await loadLibrary()
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose a card-back image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'] }]
    })
    const file = filePaths[0]
    if (canceled || !file) return library

    await mkdir(dir, { recursive: true })
    const id = `back-${Date.now()}`
    const png = await sharp(file, { limitInputPixels: false }).png().toBuffer()
    // Square any transparent rounded corners now (with the back's border colour),
    // matching how Scryfall source images are squared on download.
    await writeFile(imagePath(id), await squareOffCorners(new Uint8Array(png)))

    const next: CardBackLibrary = {
      backs: [...library.backs, { id, name: nameFromFile(file, library.backs) }],
      selectedId: id // newly added back becomes the active one
    }
    await saveLibrary(next)
    return next
  })

  ipcMain.handle(IpcChannel.CardBackList, (): Promise<CardBackLibrary> => loadLibrary())

  ipcMain.handle(
    IpcChannel.CardBackSelect,
    async (_event, id: string): Promise<CardBackLibrary> => {
      const library = await loadLibrary()
      if (!library.backs.some((entry) => entry.id === id)) return library
      const next = { ...library, selectedId: id }
      await saveLibrary(next)
      return next
    }
  )

  ipcMain.handle(
    IpcChannel.CardBackDelete,
    async (_event, id: string): Promise<CardBackLibrary> => {
      const library = await loadLibrary()
      await rm(imagePath(id), { force: true })
      const backs = library.backs.filter((entry) => entry.id !== id)
      const next: CardBackLibrary = {
        backs,
        // Keep the selection unless we removed it; then fall back to the first.
        selectedId: library.selectedId === id ? (backs[0]?.id ?? null) : library.selectedId
      }
      await saveLibrary(next)
      return next
    }
  )

  return {
    getBytes: async () => {
      const { selectedId } = await loadLibrary()
      if (!selectedId) return null
      const path = imagePath(selectedId)
      if (!(await exists(path))) return null
      return new Uint8Array(await readFile(path))
    }
  }
}
