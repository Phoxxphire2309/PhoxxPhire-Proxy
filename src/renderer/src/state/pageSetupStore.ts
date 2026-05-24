import { create } from 'zustand'
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from '@shared/layout'

interface PageSetupState {
  options: ExportOptions
  set: <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => void
  replace: (options: ExportOptions) => void
  reset: () => void
}

/** The single source of layout/print options shared by Page setup, preview, and export. */
export const usePageSetupStore = create<PageSetupState>((set) => ({
  options: DEFAULT_EXPORT_OPTIONS,
  set: (key, value) => set((state) => ({ options: { ...state.options, [key]: value } })),
  replace: (options) => {
    // Migrate a legacy single `marginMm` to the per-edge fields.
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
    set({ options: { ...DEFAULT_EXPORT_OPTIONS, ...options, ...migrated } })
  },
  reset: () => set({ options: DEFAULT_EXPORT_OPTIONS })
}))
