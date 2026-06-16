import { create } from 'zustand'
import type { PagePreset } from '@shared/appState'
import {
  DEFAULT_EXPORT_OPTIONS,
  defaultPageSizeForRegion,
  type ExportOptions
} from '@shared/layout'

/** The user's region (ISO country code) from the browser/OS locale, if any. */
function detectRegion(): string | undefined {
  try {
    return new Intl.Locale(navigator.language).region ?? undefined
  } catch {
    return undefined
  }
}

/** First-run defaults: the standard options with the locale-appropriate paper size. */
const initialOptions: ExportOptions = {
  ...DEFAULT_EXPORT_OPTIONS,
  pageSize: defaultPageSizeForRegion(detectRegion())
}

/** Migrate a legacy single `marginMm` to the per-edge fields, then fill defaults. */
function normalizeOptions(options: ExportOptions): ExportOptions {
  const legacy = (options as { marginMm?: number }).marginMm
  const migrated =
    typeof legacy === 'number' && options.marginTopMm === undefined
      ? {
          marginTopMm: legacy,
          marginRightMm: legacy,
          marginBottomMm: legacy,
          marginLeftMm: legacy
        }
      : {}
  return { ...DEFAULT_EXPORT_OPTIONS, ...options, ...migrated }
}

interface PageSetupState {
  options: ExportOptions
  /** Named page-setup profiles the user can save and switch between. */
  presets: PagePreset[]
  set: <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => void
  replace: (options: ExportOptions) => void
  reset: () => void
  /** Save the current options as a new preset (or overwrite one with the same name). */
  savePreset: (name: string) => void
  /** Load a preset's options into the live page setup. */
  applyPreset: (id: string) => void
  deletePreset: (id: string) => void
  /** Restore persisted presets at startup. */
  restorePresets: (presets: PagePreset[]) => void
}

/** The single source of layout/print options shared by Page setup, preview, and export. */
export const usePageSetupStore = create<PageSetupState>((set, get) => ({
  options: initialOptions,
  presets: [],
  set: (key, value) => set((state) => ({ options: { ...state.options, [key]: value } })),
  replace: (options) => set({ options: normalizeOptions(options) }),
  reset: () => set({ options: initialOptions }),
  savePreset: (name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const options = get().options
    set((state) => {
      const existing = state.presets.find((preset) => preset.name === trimmed)
      if (existing) {
        return {
          presets: state.presets.map((preset) =>
            preset.id === existing.id ? { ...preset, options } : preset
          )
        }
      }
      const preset: PagePreset = { id: crypto.randomUUID(), name: trimmed, options }
      return { presets: [...state.presets, preset] }
    })
  },
  applyPreset: (id) => {
    const preset = get().presets.find((entry) => entry.id === id)
    if (preset) set({ options: normalizeOptions(preset.options) })
  },
  deletePreset: (id) =>
    set((state) => ({ presets: state.presets.filter((preset) => preset.id !== id) })),
  restorePresets: (presets) => set({ presets })
}))
