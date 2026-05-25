import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type PhoxxApi, type UpscaleStatusEvent } from '@shared/ipc'
import type { ExportProgress } from '@shared/layout'
import type { ImportProgress } from '@shared/decklist'
import type { InstallPhase } from '@shared/upscaleInstall'

const api: PhoxxApi = {
  getVersion: () => ipcRenderer.invoke(IpcChannel.AppGetVersion),
  searchCards: (query, options) => ipcRenderer.invoke(IpcChannel.ScryfallSearch, query, options),
  autocomplete: (query) => ipcRenderer.invoke(IpcChannel.ScryfallAutocomplete, query),
  getPrintings: (oracleId) => ipcRenderer.invoke(IpcChannel.ScryfallPrints, oracleId),
  resolveDeck: (text, excludeFoils) =>
    ipcRenderer.invoke(IpcChannel.ScryfallResolveDeck, text, excludeFoils),
  importDeckUrl: (url, excludeFoils) =>
    ipcRenderer.invoke(IpcChannel.ScryfallImportUrl, url, excludeFoils),
  findTokens: (cardIds) => ipcRenderer.invoke(IpcChannel.ScryfallFindTokens, cardIds),
  findCombos: (cards) => ipcRenderer.invoke(IpcChannel.CombosFind, cards),
  onImportProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ImportProgress): void =>
      listener(data)
    ipcRenderer.on(IpcChannel.ScryfallImportProgress, handler)
    return () => ipcRenderer.removeListener(IpcChannel.ScryfallImportProgress, handler)
  },
  saveDeck: (deck) => ipcRenderer.invoke(IpcChannel.DeckSave, deck),
  loadDeck: () => ipcRenderer.invoke(IpcChannel.DeckLoad),
  exportDecklist: (format, content) =>
    ipcRenderer.invoke(IpcChannel.DecklistExport, format, content),
  saveProject: (project) => ipcRenderer.invoke(IpcChannel.ProjectSave, project),
  loadProject: () => ipcRenderer.invoke(IpcChannel.ProjectLoad),
  importCustomCard: () => ipcRenderer.invoke(IpcChannel.CustomCardImport),
  importCardBack: () => ipcRenderer.invoke(IpcChannel.CardBackImport),
  getCardBacks: () => ipcRenderer.invoke(IpcChannel.CardBackList),
  selectCardBack: (id) => ipcRenderer.invoke(IpcChannel.CardBackSelect, id),
  deleteCardBack: (id) => ipcRenderer.invoke(IpcChannel.CardBackDelete, id),
  getAppState: () => ipcRenderer.invoke(IpcChannel.StateGet),
  setAppState: (state) => ipcRenderer.invoke(IpcChannel.StateSet, state),
  exportPdf: (request) => ipcRenderer.invoke(IpcChannel.ExportPdf, request),
  printPdf: (request) => ipcRenderer.invoke(IpcChannel.ExportPrint, request),
  exportImages: (slots) => ipcRenderer.invoke(IpcChannel.ExportImages, slots),
  exportZip: (slots) => ipcRenderer.invoke(IpcChannel.ExportZip, slots),
  exportMpc: (cards) => ipcRenderer.invoke(IpcChannel.ExportMpc, cards),
  exportCalibration: (options) => ipcRenderer.invoke(IpcChannel.ExportCalibration, options),
  onExportProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, data: ExportProgress): void =>
      listener(data)
    ipcRenderer.on(IpcChannel.ExportProgress, handler)
    return () => ipcRenderer.removeListener(IpcChannel.ExportProgress, handler)
  },
  isUpscalerAvailable: () => ipcRenderer.invoke(IpcChannel.UpscaleAvailable),
  getUpscaleSettings: () => ipcRenderer.invoke(IpcChannel.UpscaleGetSettings),
  setUpscaleSettings: (settings) => ipcRenderer.invoke(IpcChannel.UpscaleSetSettings, settings),
  installUpscaler: () => ipcRenderer.invoke(IpcChannel.UpscaleInstall),
  onUpscaleInstallProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, phase: InstallPhase): void =>
      listener(phase)
    ipcRenderer.on(IpcChannel.UpscaleInstallProgress, handler)
    return () => ipcRenderer.removeListener(IpcChannel.UpscaleInstallProgress, handler)
  },
  getCacheInfo: () => ipcRenderer.invoke(IpcChannel.CacheInfo),
  clearCache: () => ipcRenderer.invoke(IpcChannel.CacheClear),
  rebuildImageCache: () => ipcRenderer.invoke(IpcChannel.CacheRebuildImages),
  onUpscaleStatus: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, data: UpscaleStatusEvent): void =>
      listener(data)
    ipcRenderer.on(IpcChannel.UpscaleStatus, handler)
    return () => ipcRenderer.removeListener(IpcChannel.UpscaleStatus, handler)
  }
}

// With context isolation on (the default and only safe mode), the renderer can
// only reach main-process functionality through this explicitly exposed bridge.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('phoxx', api)
} else {
  // Should never happen given our webPreferences, but fail loudly if it does.
  throw new Error('contextIsolation is disabled; refusing to expose the IPC bridge unsafely.')
}
