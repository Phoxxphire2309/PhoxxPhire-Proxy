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
import type { MpcfillService } from '../mpcfill/service'
import type { UpscaleService } from '../upscale/service'
import { applyColorProfile, buildMpcCardBack, buildMpcImage, extendBleed } from '../image/processor'
import { buildCalibrationPdf } from './calibration'
import { buildCutFileSvg } from './cutfile'
import { ExportService } from './service'

export interface ExportSetupOptions {
  scryfall: ScryfallService
  mpcfill: MpcfillService
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
 * Loads a self-contained HTML document in an offscreen window and opens the OS
 * print dialog. Printing rendered HTML is reliable (unlike printing a loaded
 * PDF, whose plugin frame often never returns a print callback). Resolves true
 * if the job was sent, false if the user cancelled; rejects on a load failure.
 * A timeout guards the load so a stuck render can't hang the caller forever.
 */
function printHtmlFile(htmlPath: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const win = new BrowserWindow({ show: false })
    const cleanup = (): void => {
      if (!win.isDestroyed()) win.close()
    }
    const loadTimer = setTimeout(() => {
      cleanup()
      reject(new Error('Timed out preparing the document for printing.'))
    }, 30_000)

    win.webContents.once('did-finish-load', () => {
      clearTimeout(loadTimer)
      // marginType 'none' stops Chromium fitting the full-page sheet inside the
      // printer's default margins — that fit-to-margins step silently shrinks
      // every card by a few percent. With zero margins the page prints 1:1 at
      // true size (cards already sit inside a layout margin, so the printer's
      // unprintable edge clips nothing). Mirrors MTGProxyPrinter's full-page,
      // "prevent downscaling the page content" rendering.
      const printOptions = {
        silent: false,
        printBackground: true,
        margins: { marginType: 'none' as const }
      }
      win.webContents.print(printOptions, (success, failureReason) => {
        cleanup()
        // A user-cancelled dialog isn't an error; anything else is.
        if (success || /cancel/i.test(failureReason)) resolve(success)
        else reject(new Error(failureReason || 'Printing failed'))
      })
    })
    win.webContents.once('did-fail-load', (_event, _code, description) => {
      clearTimeout(loadTimer)
      cleanup()
      reject(new Error(`Could not open the document for printing: ${description}`))
    })

    win.loadFile(htmlPath).catch((error: unknown) => {
      clearTimeout(loadTimer)
      cleanup()
      reject(error instanceof Error ? error : new Error('Could not open the document for printing'))
    })
  })
}

/**
 * Builds a default export filename from the deck name, stripping characters that
 * are invalid in filenames and falling back when the name is empty.
 */
function exportFileName(name: string | undefined, extension: string, fallback: string): string {
  const cleaned = (name ?? '').replace(/[/\\:*?"<>|]+/g, '').trim()
  return `${cleaned || fallback}.${extension}`
}

/** Wires the PDF export IPC handler. Call after `app.whenReady()`. */
export function initExport(options: ExportSetupOptions): void {
  const service = new ExportService({
    resolveCard: (cardId) => options.scryfall.getCard(cardId),
    ensureImage: (cardId, faceIndex, useUpscaled) =>
      useUpscaled && options.upscale.available()
        ? options.upscale.ensureUpscaled(cardId, faceIndex)
        : options.scryfall.ensureFaceImage(cardId, faceIndex),
    ensureMpcfillImage: (identifier) => options.mpcfill.ensureImage(identifier, 'source'),
    proxyImage: (cardId, faceIndex) => options.scryfall.ensureProxyImage(cardId, faceIndex),
    processImage: async (bytes, exportOptions, alreadyBled) => {
      // MPCFill images already include bleed, so only colour-manage them; Scryfall
      // scans are borderless and get mirrored bleed added first.
      const prepared = alreadyBled
        ? bytes
        : await extendBleed(bytes, exportOptions.bleedMm, exportOptions.bleedMode)
      return applyColorProfile(prepared, exportOptions.colorProfile)
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
        defaultPath: exportFileName(request.name, 'pdf', 'proxies'),
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
      // Render the sheet to a temp HTML doc, print it, then clean up regardless.
      const tmpPath = join(app.getPath('temp'), `phoxx-print-${Date.now()}.html`)
      try {
        const { html, cardCount } = await service.renderPrintHtml(request.slots, request.options)
        await writeFile(tmpPath, html, 'utf8')
        const printed = await printHtmlFile(tmpPath)
        return printed ? { canceled: false, cardCount } : { canceled: true }
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
    async (_event, slots: ExportSlot[], name?: string): Promise<ExportImagesOutcome> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export card images as ZIP',
        defaultPath: exportFileName(name, 'zip', 'card-images'),
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

  ipcMain.handle(
    IpcChannel.ExportCutFile,
    async (_event, exportOptions: ExportOptions): Promise<CalibrationOutcome> => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save cut file',
        defaultPath: 'cut-file.svg',
        filters: [{ name: 'SVG', extensions: ['svg'] }]
      })
      if (canceled || !filePath) return { canceled: true }
      await writeFile(filePath, buildCutFileSvg(exportOptions, false), 'utf8')
      // For duplex, also write a mirrored back cut file alongside it.
      if (exportOptions.cardBack !== 'none') {
        const backPath = filePath.replace(/\.svg$/i, '') + '-back.svg'
        await writeFile(backPath, buildCutFileSvg(exportOptions, true), 'utf8')
      }
      return { canceled: false, path: filePath }
    }
  )
}
