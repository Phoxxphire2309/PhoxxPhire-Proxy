/**
 * Shared IPC contract between the main process and the renderer.
 *
 * Channel names are centralised here so both sides stay in lockstep, and the
 * `PhoxxApi` interface is the single source of truth for what the preload
 * bridge exposes on `window.phoxx`.
 */

import type { AppState } from './appState'
import type {
  DeckLoadOutcome,
  DeckSaveOutcome,
  ProjectLoadOutcome,
  ProjectSaveOutcome,
  SavedDeck,
  SavedProject
} from './deck'
import type { ComboCardInput, ComboResult } from './combo'
import type { DeckResolution, ImportProgress } from './decklist'
import type { DecklistExportOutcome, DecklistFormat } from './decklistExport'
import type {
  CalibrationOutcome,
  ExportImagesOutcome,
  ExportOptions,
  ExportOutcome,
  ExportProgress,
  ExportRequest,
  ExportSlot,
  PrintOutcome
} from './layout'
import type { MpcCard, MpcExportOutcome } from './mpc'
import type { Card, SearchOptions, SearchResult } from './scryfall'
import type { InstallPhase } from './upscaleInstall'

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  UpdateCheck: 'update:check',
  ScryfallSearch: 'scryfall:search',
  ScryfallAutocomplete: 'scryfall:autocomplete',
  ScryfallPrints: 'scryfall:prints',
  ScryfallResolveDeck: 'scryfall:resolveDeck',
  ScryfallImportUrl: 'scryfall:importUrl',
  ScryfallFindTokens: 'scryfall:findTokens',
  CombosFind: 'combos:find',
  /** Main → renderer push channel for per-card deck-import progress. */
  ScryfallImportProgress: 'scryfall:importProgress',
  DeckSave: 'deck:save',
  DeckLoad: 'deck:load',
  DecklistExport: 'decklist:export',
  ProjectSave: 'project:save',
  ProjectLoad: 'project:load',
  CustomCardImport: 'custom:import',
  CardBackImport: 'cardback:import',
  CardBackList: 'cardback:list',
  CardBackSelect: 'cardback:select',
  CardBackDelete: 'cardback:delete',
  CardBackImage: 'cardback:image',
  StateGet: 'state:get',
  StateSet: 'state:set',
  UpscaleAvailable: 'upscale:available',
  UpscaleGetSettings: 'upscale:getSettings',
  UpscaleSetSettings: 'upscale:setSettings',
  UpscaleInstall: 'upscale:install',
  CacheInfo: 'cache:info',
  CacheClear: 'cache:clear',
  CacheRebuildImages: 'cache:rebuildImages',
  /** Main → renderer push channel for per-face upscale progress. */
  UpscaleStatus: 'upscale:status',
  /** Main → renderer push channel for one-click install progress. */
  UpscaleInstallProgress: 'upscale:installProgress',
  ExportPdf: 'export:pdf',
  ExportPrint: 'export:print',
  ExportImages: 'export:images',
  ExportZip: 'export:zip',
  ExportMpc: 'export:mpc',
  ExportCalibration: 'export:calibration',
  ExportCutFile: 'export:cutFile',
  /** Main → renderer push channel for export progress. */
  ExportProgress: 'export:progress'
} as const

export type IpcChannel = (typeof IpcChannel)[keyof typeof IpcChannel]

export const UPSCALE_MODELS = ['realesrgan-x4plus', 'realesrgan-x4plus-anime'] as const
export type UpscaleModel = (typeof UPSCALE_MODELS)[number]

export interface UpscaleSettings {
  model: string
  scale: number
  available: boolean
}

export interface CacheInfo {
  bytes: number
  /** Absolute path to the on-disk cache directory. */
  path: string
}

/** One saved custom card back in the library. */
export interface CardBackEntry {
  id: string
  name: string
}

/** The card-back library: saved backs and which one is currently selected. */
export interface CardBackLibrary {
  backs: CardBackEntry[]
  /** Id of the back used for 'custom' exports, or null when none is selected. */
  selectedId: string | null
}

export type UpscaleStatus = 'queued' | 'upscaling' | 'ready' | 'failed'

/** Progress update for a single card face moving through the upscale pipeline. */
export interface UpscaleStatusEvent {
  cardId: string
  faceIndex: number
  status: UpscaleStatus
  error?: string
}

/** A newer published release than the running build. */
export interface UpdateInfo {
  /** The newer version, e.g. "1.1.0". */
  version: string
  /** The release page to download it from. */
  url: string
}

/** Surface exposed to the renderer via `contextBridge`. Grows per build phase. */
export interface PhoxxApi {
  /** Returns the running application version (from package.json). */
  getVersion(): Promise<string>
  /** Checks GitHub Releases for a newer version; null if up to date or offline. */
  checkForUpdate(): Promise<UpdateInfo | null>
  /** Full-text Scryfall search; returns normalized cards (first page). */
  searchCards(query: string, options?: SearchOptions): Promise<SearchResult>
  /** Card-name autocomplete suggestions for a partial query. */
  autocomplete(query: string): Promise<string[]>
  /** All printings (across sets) of the card with the given Scryfall oracle id. */
  getPrintings(oracleId: string): Promise<Card[]>
  /** Parse a decklist and resolve every line to a Scryfall card. */
  resolveDeck(
    text: string,
    excludeFoils?: boolean,
    removeBasics?: boolean,
    language?: string
  ): Promise<DeckResolution>
  /** Fetch + resolve a decklist from a supported site URL (Archidekt, Moxfield…). */
  importDeckUrl(
    url: string,
    excludeFoils?: boolean,
    removeBasics?: boolean,
    language?: string
  ): Promise<DeckResolution>
  /** Distinct tokens / emblems created by the given deck cards, ready to add. */
  findTokens(cardIds: string[]): Promise<Card[]>
  /** Find the combos present in the deck via the Commander Spellbook API. */
  findCombos(cards: ComboCardInput[]): Promise<ComboResult>
  /** Subscribe to per-card deck-import progress; returns an unsubscribe function. */
  onImportProgress(listener: (progress: ImportProgress) => void): () => void
  /** Save a deck to a JSON file (prompts for a path). */
  saveDeck(deck: SavedDeck): Promise<DeckSaveOutcome>
  /** Load a deck from a JSON file (prompts for a file). */
  loadDeck(): Promise<DeckLoadOutcome>
  /** Save the deck as a decklist file in the given format (prompts for a path). */
  exportDecklist(format: DecklistFormat, content: string): Promise<DecklistExportOutcome>
  /** Save a full project (deck + page setup) to a file (prompts for a path). */
  saveProject(project: SavedProject): Promise<ProjectSaveOutcome>
  /** Load a project (deck + page setup) from a file (prompts for a file). */
  loadProject(): Promise<ProjectLoadOutcome>
  /** Pick an image file and register it as a custom card; null if cancelled. */
  importCustomCard(): Promise<Card | null>
  /** Pick an image file, add it to the card-back library, and select it. */
  importCardBack(): Promise<CardBackLibrary>
  /** The saved card backs and which one is selected. */
  getCardBacks(): Promise<CardBackLibrary>
  /** Select which saved back is used for 'custom' exports. */
  selectCardBack(id: string): Promise<CardBackLibrary>
  /** Delete a saved back from the library. */
  deleteCardBack(id: string): Promise<CardBackLibrary>
  /** A data-URL of a card back (the given id, or the selected one), or null. */
  getCardBackImage(id?: string): Promise<string | null>
  /** Read persisted app state (deck, settings, theme), or null if none saved. */
  getAppState(): Promise<AppState | null>
  /** Persist app state to disk. */
  setAppState(state: AppState): Promise<void>
  /** Render the given cards into a print-ready PDF (prompts for a save path). */
  exportPdf(request: ExportRequest): Promise<ExportOutcome>
  /** Render the proxy sheet and send it straight to a printer (shows the OS print dialog). */
  printPdf(request: ExportRequest): Promise<PrintOutcome>
  /** Export each unique card face as a PNG into a chosen folder. */
  exportImages(slots: ExportSlot[]): Promise<ExportImagesOutcome>
  /** Bundle every unique card face (upscaled or source) into a single ZIP file. */
  exportZip(slots: ExportSlot[], name?: string): Promise<ExportImagesOutcome>
  /** Export the deck as a MakePlayingCards (MPC Autofill) order into a chosen folder. */
  exportMpc(cards: MpcCard[]): Promise<MpcExportOutcome>
  /** Save a print-calibration PDF for the given page options. */
  exportCalibration(options: ExportOptions): Promise<CalibrationOutcome>
  /** Save an SVG cut file (trim paths + registration marks) for cutting machines. */
  exportCutFile(options: ExportOptions): Promise<CalibrationOutcome>
  /** Subscribe to export progress; returns an unsubscribe function. */
  onExportProgress(listener: (progress: ExportProgress) => void): () => void
  /** Whether the Real-ESRGAN binary is provisioned and usable. */
  isUpscalerAvailable(): Promise<boolean>
  /** Current upscale model + scale, and whether upscaling is available. */
  getUpscaleSettings(): Promise<UpscaleSettings>
  /** Update the upscale model + scale; returns the applied settings. */
  setUpscaleSettings(settings: { model: string; scale: number }): Promise<UpscaleSettings>
  /** Download + install the Real-ESRGAN binary; resolves with the new settings. */
  installUpscaler(): Promise<UpscaleSettings>
  /** Subscribe to install progress; returns an unsubscribe function. */
  onUpscaleInstallProgress(listener: (phase: InstallPhase) => void): () => void
  /** Total size of the on-disk image/metadata cache. */
  getCacheInfo(): Promise<CacheInfo>
  /** Delete the on-disk cache; returns the (near-zero) size afterwards. */
  clearCache(): Promise<CacheInfo>
  /** Drop only cached images (keeping card metadata) so they re-process with current logic. */
  rebuildImageCache(): Promise<CacheInfo>
  /** Subscribe to upscale progress events; returns an unsubscribe function. */
  onUpscaleStatus(listener: (event: UpscaleStatusEvent) => void): () => void
}
