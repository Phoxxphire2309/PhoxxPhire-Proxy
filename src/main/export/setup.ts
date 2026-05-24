import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  CalibrationOutcome,
  ExportImagesOutcome,
  ExportOptions,
  ExportOutcome,
  ExportProgress,
  ExportRequest,
  ExportSlot
} from '@shared/layout'
import type { MpcCard, MpcExportOutcome } from '@shared/mpc'
import type { ScryfallService } from '../scryfall/service'
import type { UpscaleService } from '../upscale/service'
import { buildMpcCardBack, buildMpcImage, extendBleed } from '../image/processor'
import { buildCalibrationPdf } from './calibration'
import { ExportService } from './service'

export interface ExportSetupOptions {
  scryfall: ScryfallService
  upscale: UpscaleService
}

function broadcastProgress(progress: ExportProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.ExportProgress, progress)
    }
  }
}

/** Wires the PDF export IPC handler. Call after `app.whenReady()`. */
export function initExport(options: ExportSetupOptions): void {
  const service = new ExportService({
    resolveCard: (cardId) => options.scryfall.getCard(cardId),
    ensureImage: (cardId, faceIndex, useUpscaled) =>
      useUpscaled && options.upscale.available()
        ? options.upscale.ensureUpscaled(cardId, faceIndex)
        : options.scryfall.ensureFaceImage(cardId, faceIndex),
    processImage: (bytes, exportOptions) =>
      extendBleed(bytes, exportOptions.bleedMm, exportOptions.bleedMode),
    mpcImage: buildMpcImage,
    mpcCardBack: buildMpcCardBack,
    emit: broadcastProgress
  })

  ipcMain.handle(
    IpcChannel.ExportPdf,
    async (_event, request: ExportRequest): Promise<ExportOutcome> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export proxy PDF',
        defaultPath: 'proxies.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (canceled || !filePath) {
        return { canceled: true }
      }

      const result = await service.export(request.slots, request.options, filePath)
      return { canceled: false, ...result }
    }
  )

  ipcMain.handle(
    IpcChannel.ExportImages,
    async (_event, slots: ExportSlot[]): Promise<ExportImagesOutcome> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Choose a folder for card images',
        properties: ['openDirectory', 'createDirectory']
      })
      const folder = filePaths[0]
      if (canceled || !folder) {
        return { canceled: true }
      }
      const result = await service.exportImages(slots, folder)
      return { canceled: false, ...result }
    }
  )

  ipcMain.handle(
    IpcChannel.ExportZip,
    async (_event, slots: ExportSlot[]): Promise<ExportImagesOutcome> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export card images as ZIP',
        defaultPath: 'card-images.zip',
        filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
      })
      if (canceled || !filePath) {
        return { canceled: true }
      }
      const result = await service.exportZip(slots, filePath)
      return { canceled: false, ...result }
    }
  )

  ipcMain.handle(
    IpcChannel.ExportMpc,
    async (_event, cards: MpcCard[]): Promise<MpcExportOutcome> => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Choose a folder for the MakePlayingCards order',
        properties: ['openDirectory', 'createDirectory']
      })
      const folder = filePaths[0]
      if (canceled || !folder) {
        return { canceled: true }
      }
      const result = await service.exportMpc(cards, folder)
      return { canceled: false, ...result }
    }
  )

  ipcMain.handle(
    IpcChannel.ExportCalibration,
    async (_event, exportOptions: ExportOptions): Promise<CalibrationOutcome> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save calibration page',
        defaultPath: 'calibration.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
      if (canceled || !filePath) {
        return { canceled: true }
      }
      const pdf = await buildCalibrationPdf(exportOptions)
      await writeFile(filePath, pdf)
      return { canceled: false, path: filePath }
    }
  )
}
