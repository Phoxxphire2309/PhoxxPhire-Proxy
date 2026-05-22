import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type { AppState } from '@shared/appState'

function statePath(): string {
  return join(app.getPath('userData'), 'app-state.json')
}

/** Wires app-state persistence IPC. Call after `app.whenReady()`. */
export function initPersistence(): void {
  ipcMain.handle(IpcChannel.StateGet, async (): Promise<AppState | null> => {
    try {
      return JSON.parse(await readFile(statePath(), 'utf8')) as AppState
    } catch {
      return null
    }
  })

  ipcMain.handle(IpcChannel.StateSet, async (_event, state: AppState): Promise<void> => {
    await writeFile(statePath(), JSON.stringify(state), 'utf8')
  })
}
