import { readFile, writeFile } from 'node:fs/promises'
import { dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { DeckLoadOutcome, DeckSaveOutcome, SavedDeck } from '@shared/deck'

function isSavedDeck(value: unknown): value is SavedDeck {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { items?: unknown }).items)
  )
}

/** Wires deck save/load IPC. Call after `app.whenReady()`. */
export function initDeckIo(): void {
  ipcMain.handle(IpcChannel.DeckSave, async (_event, deck: SavedDeck): Promise<DeckSaveOutcome> => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save deck',
      defaultPath: 'deck.json',
      filters: [{ name: 'Deck JSON', extensions: ['json'] }]
    })
    if (canceled || !filePath) return { canceled: true }
    await writeFile(filePath, JSON.stringify(deck, null, 2), 'utf8')
    return { canceled: false, path: filePath }
  })

  ipcMain.handle(IpcChannel.DeckLoad, async (): Promise<DeckLoadOutcome> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open deck',
      properties: ['openFile'],
      filters: [{ name: 'Deck JSON', extensions: ['json'] }]
    })
    const file = filePaths[0]
    if (canceled || !file) return { canceled: true }

    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!isSavedDeck(parsed)) {
      throw new Error('That file is not a PhoxxPhire deck.')
    }
    return { canceled: false, deck: parsed }
  })
}
