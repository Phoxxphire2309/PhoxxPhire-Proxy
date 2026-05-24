import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  CalibrationOutcome,
  ExportImagesOutcome,
  ExportOptions,
  ExportOutcome,
  ExportProgress,
  ExportRequest,
  ExportSlot,
  PrintOutcome
} from '@shared/layout'
import type { MpcCard, MpcExportOutcome } from '@shared/mpc'
import type { CardBackManager } from '../cardback/setup'
import type { ScryfallService } from '../scryfall/service'
import type { UpscaleService } from '../upscale/service'
import { applyColorProfile, buildMpcCardBack, buildMpcImage, extendBleed } from '../image/processor'
import { buildCalibrationPdf } from './calibration'
import { ExportService } from './service'

export interface ExportSetupOptions {
  scryfall: ScryfallService
  upscale: UpscaleService
  cardBack: CardBackManager
}

function broadcastProgress(progress: ExportProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannel.ExportProgress, progress)
    }
  }
}

/**
 * Loads a PDF in an offscreen window (Chromium's PDF viewer needs `plugins`)
 * and opens the OS print dialog. Resolves true if the job was sent, false if the
 * user cancelled the dialog; rejects on a genuine load/print failure.
 */
function printPdfFile(pdfPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const win = new BrowserWindow({ show: false, webPreferences: { plugins: true } })
    const cleanup = (): void => {
      if (!win.isDestroyed()) win.close()
    }

    win.webContents.once('did-finish-load', () => {
      win.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        cleanup()
        // A user-cancelled dialog isn't an error; anything else is.
        if (success || /cancel/i.test(failureReason)) resolve(success)
        else reject(new Error(failureReason || 'Printing failed'))
      })
    })
    win.webContents.once('did-fail-load', (_event, _code, description) => {
      cleanup()
      reject(new Error(`Could not open the document for printing: ${description}`))
    })

    win.loadFile(pdfPath).catch((error: unknown) => {
      cleanup()
      reject(error instanceof Error ? error : new Error('Could not open the document for printing'))
    })
  })
}

/** Wires the PDF export IPC handler. Call after `app.whenReady()`. */
export function initExport(options: ExportSetupOptions): void {
  const service = new ExportService({
    resolveCard: (cardId) => options.scryfall.getCard(cardId),
    ensureImage: (cardId, faceIndex, useUpscaled) =>
      useUpscaled && options.upscale.available()
        ? options.upscale.ensureUpscaled(cardId, faceIndex)
        : options.scryfall.ensureFaceImage(cardId, faceIndex),
    processImage: async (bytes, exportOptions) => {
      const bled = await extendBleed(bytes, exportOptions.bleedMm, exportOptions.bleedMode)
      return applyColorProfile(bled, exportOptions.colorProfile)
    },
    mpcImage: buildMpcImage,
    mpcCardBack: buildMpcCardBack,
    customCardBack: () => options.cardBack.getBytes(),
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
    IpcChannel.ExportPrint,
    async (_event, request: ExportRequest): Promise<PrintOutcome> => {
      // Render to a temp PDF, print it, then clean up regardless of outcome.
      const tmpPath = join(app.getPath('temp'), `phoxx-print-${Date.now()}.pdf`)
      try {
        const result = await service.export(request.slots, request.options, tmpPath)
        const printed = await printPdfFile(tmpPath)
        return printed ? { canceled: false, cardCount: result.cardCount } : { canceled: true }
      } finally {
        await rm(tmpPath, { force: true })
      }
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
