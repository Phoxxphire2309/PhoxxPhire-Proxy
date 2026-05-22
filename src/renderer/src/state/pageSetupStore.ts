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
  replace: (options) => set({ options: { ...DEFAULT_EXPORT_OPTIONS, ...options } }),
  reset: () => set({ options: DEFAULT_EXPORT_OPTIONS })
}))
