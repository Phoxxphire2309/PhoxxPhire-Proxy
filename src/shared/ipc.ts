/**
 * Shared IPC contract between the main process and the renderer.
 *
 * Channel names are centralised here so both sides stay in lockstep, and the
 * `PhoxxApi` interface is the single source of truth for what the preload
 * bridge exposes on `window.phoxx`.
 */

import type { AppState } from './appState'
import type { DeckLoadOutcome, DeckSaveOutcome, SavedDeck } from './deck'
import type { DeckResolution } from './decklist'
import type {
  CalibrationOutcome,
  ExportImagesOutcome,
  ExportOptions,
  ExportOutcome,
  ExportProgress,
  ExportRequest,
  ExportRequestCard
} from './layout'
import type { Card, SearchResult } from './scryfall'

export const IpcChannel = {
  AppGetVersion: 'app:getVersion',
  ScryfallSearch: 'scryfall:search',
  ScryfallAutocomplete: 'scryfall:autocomplete',
  ScryfallPrints: 'scryfall:prints',
  ScryfallResolveDeck: 'scryfall:resolveDeck',
  ScryfallImportUrl: 'scryfall:importUrl',
  DeckSave: 'deck:save',
  DeckLoad: 'deck:load',
  CustomCardImport: 'custom:import',
  StateGet: 'state:get',
  StateSet: 'state:set',
  UpscaleAvailable: 'upscale:available',
  UpscaleGetSettings: 'upscale:getSettings',
  UpscaleSetSettings: 'upscale:setSettings',
  CacheInfo: 'cache:info',
  CacheClear: 'cache:clear',
  /** Main → renderer push channel for per-face upscale progress. */
  UpscaleStatus: 'upscale:status',
  ExportPdf: 'export:pdf',
  ExportImages: 'export:images',
  ExportCalibration: 'export:calibration',
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
}

export type UpscaleStatus = 'queued' | 'upscaling' | 'ready' | 'failed'

/** Progress update for a single card face moving through the upscale pipeline. */
export interface UpscaleStatusEvent {
  cardId: string
  faceIndex: number
  status: UpscaleStatus
  error?: string
}

/** Surface exposed to the renderer via `contextBridge`. Grows per build phase. */
export interface PhoxxApi {
  /** Returns the running application version (from package.json). */
  getVersion(): Promise<string>
  /** Full-text Scryfall search; returns normalized cards (first page). */
  searchCards(query: string): Promise<SearchResult>
  /** Card-name autocomplete suggestions for a partial query. */
  autocomplete(query: string): Promise<string[]>
  /** All printings (across sets) of the card with the given Scryfall oracle id. */
  getPrintings(oracleId: string): Promise<Card[]>
  /** Parse a decklist and resolve every line to a Scryfall card. */
  resolveDeck(text: string): Promise<DeckResolution>
  /** Fetch + resolve a decklist from a supported site URL (Archidekt, Moxfield). */
  importDeckUrl(url: string): Promise<DeckResolution>
  /** Save a deck to a JSON file (prompts for a path). */
  saveDeck(deck: SavedDeck): Promise<DeckSaveOutcome>
  /** Load a deck from a JSON file (prompts for a file). */
  loadDeck(): Promise<DeckLoadOutcome>
  /** Pick an image file and register it as a custom card; null if cancelled. */
  importCustomCard(): Promise<Card | null>
  /** Read persisted app state (deck, settings, theme), or null if none saved. */
  getAppState(): Promise<AppState | null>
  /** Persist app state to disk. */
  setAppState(state: AppState): Promise<void>
  /** Render the given cards into a print-ready PDF (prompts for a save path). */
  exportPdf(request: ExportRequest): Promise<ExportOutcome>
  /** Export each unique card face as a PNG into a chosen folder. */
  exportImages(cards: ExportRequestCard[]): Promise<ExportImagesOutcome>
  /** Save a print-calibration PDF for the given page options. */
  exportCalibration(options: ExportOptions): Promise<CalibrationOutcome>
  /** Subscribe to export progress; returns an unsubscribe function. */
  onExportProgress(listener: (progress: ExportProgress) => void): () => void
  /** Whether the Real-ESRGAN binary is provisioned and usable. */
  isUpscalerAvailable(): Promise<boolean>
  /** Current upscale model + scale, and whether upscaling is available. */
  getUpscaleSettings(): Promise<UpscaleSettings>
  /** Update the upscale model + scale; returns the applied settings. */
  setUpscaleSettings(settings: { model: string; scale: number }): Promise<UpscaleSettings>
  /** Total size of the on-disk image/metadata cache. */
  getCacheInfo(): Promise<CacheInfo>
  /** Delete the on-disk cache; returns the (near-zero) size afterwards. */
  clearCache(): Promise<CacheInfo>
  /** Subscribe to upscale progress events; returns an unsubscribe function. */
  onUpscaleStatus(listener: (event: UpscaleStatusEvent) => void): () => void
}
