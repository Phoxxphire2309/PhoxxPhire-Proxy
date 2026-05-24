import { readFile, writeFile } from 'node:fs/promises'
import { dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  DeckLoadOutcome,
  DeckSaveOutcome,
  ProjectLoadOutcome,
  ProjectSaveOutcome,
  SavedDeck,
  SavedProject
} from '@shared/deck'
import {
  DECKLIST_FILE,
  type DecklistExportOutcome,
  type DecklistFormat
} from '@shared/decklistExport'

function isSavedDeck(value: unknown): value is SavedDeck {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { items?: unknown }).items)
  )
}

function isSavedProject(value: unknown): value is SavedProject {
  return (
    typeof value === 'object' &&
    value !== null &&
    isSavedDeck((value as { deck?: unknown }).deck) &&
    typeof (value as { pageSetup?: unknown }).pageSetup === 'object'
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

  ipcMain.handle(
    IpcChannel.DecklistExport,
    async (_event, format: DecklistFormat, content: string): Promise<DecklistExportOutcome> => {
      const { extension } = DECKLIST_FILE[format]
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export decklist',
        defaultPath: `decklist.${extension}`,
        filters: [{ name: DECKLIST_FILE[format].label, extensions: [extension] }]
      })
      if (canceled || !filePath) return { canceled: true }
      await writeFile(filePath, content, 'utf8')
      return { canceled: false, path: filePath }
    }
  )

  ipcMain.handle(
    IpcChannel.ProjectSave,
    async (_event, project: SavedProject): Promise<ProjectSaveOutcome> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save project',
        defaultPath: 'project.phoxxproj',
        filters: [{ name: 'PhoxxPhire project', extensions: ['phoxxproj', 'json'] }]
      })
      if (canceled || !filePath) return { canceled: true }
      await writeFile(filePath, JSON.stringify(project, null, 2), 'utf8')
      return { canceled: false, path: filePath }
    }
  )

  ipcMain.handle(IpcChannel.ProjectLoad, async (): Promise<ProjectLoadOutcome> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open project',
      properties: ['openFile'],
      filters: [{ name: 'PhoxxPhire project', extensions: ['phoxxproj', 'json'] }]
    })
    const file = filePaths[0]
    if (canceled || !file) return { canceled: true }

    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'))
    if (!isSavedProject(parsed)) {
      throw new Error('That file is not a PhoxxPhire project.')
    }
    return { canceled: false, project: parsed }
  })
}
