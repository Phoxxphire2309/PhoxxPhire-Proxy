import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import { IpcChannel } from '@shared/ipc'
import {
  handleImageProtocol,
  registerImageProtocolScheme,
  type FaceImageResolver
} from './scryfall/image-protocol'
import { initScryfall } from './scryfall/setup'
import { initUpscale } from './upscale/setup'
import { initExport } from './export/setup'
import { initDeckIo } from './deck/setup'
import { initCustomCards } from './custom/setup'
import { initCardBack } from './cardback/setup'
import { initCombos } from './combo/setup'
import { initPersistence } from './persist/setup'
import { initAutoUpdate, initUpdateCheck } from './update/setup'

const isDev = !app.isPackaged

// Privileged schemes must be registered before the app is ready.
registerImageProtocolScheme()

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#121316',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.on('ready-to-show', () => window.show())

  // Open external links in the user's browser rather than a new app window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.AppGetVersion, () => app.getVersion())
}

app.whenReady().then(async () => {
  registerIpcHandlers()

  const { service: scryfall, cache } = await initScryfall({
    userDataDir: app.getPath('userData'),
    version: app.getVersion()
  })
  const upscale = await initUpscale({
    location: {
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      userDataDir: app.getPath('userData')
    },
    cache,
    scryfall
  })

  // thumb → medium JPEG for browsing; upscaled → Real-ESRGAN (when available);
  // source → full-resolution PNG for print/upscale.
  const resolver: FaceImageResolver = {
    resolve: (cardId, faceIndex, quality) => {
      if (quality === 'thumb') return scryfall.ensureThumbImage(cardId, faceIndex)
      if (quality === 'proxy') return scryfall.ensureProxyImage(cardId, faceIndex)
      if (quality === 'upscaled' && upscale.available())
        return upscale.ensureUpscaled(cardId, faceIndex)
      return scryfall.ensureFaceImage(cardId, faceIndex)
    }
  }
  handleImageProtocol(resolver)

  const cardBack = initCardBack(app.getPath('userData'))
  initExport({ scryfall, upscale, cardBack })
  initDeckIo()
  initCustomCards(cache)
  initCombos(net.fetch as unknown as typeof fetch)
  initUpdateCheck(net.fetch as unknown as typeof fetch)
  initPersistence()

  createWindow()
  initAutoUpdate(isDev)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
