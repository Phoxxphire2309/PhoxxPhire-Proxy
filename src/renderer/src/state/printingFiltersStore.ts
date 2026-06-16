import { create } from 'zustand'

/** Which printing filters are enabled (sparse — only the keys that are on). */
interface PrintingFiltersState {
  active: Record<string, true>
  toggle: (key: string) => void
  reset: () => void
  /** Restore the enabled-filter keys from persistence. */
  restore: (keys: string[]) => void
  isActive: (key: string) => boolean
}

export const usePrintingFiltersStore = create<PrintingFiltersState>((set, get) => ({
  active: {},
  toggle: (key) =>
    set((state) => {
      const active = { ...state.active }
      if (active[key]) delete active[key]
      else active[key] = true
      return { active }
    }),
  reset: () => set({ active: {} }),
  restore: (keys) => set({ active: Object.fromEntries(keys.map((key) => [key, true as const])) }),
  isActive: (key) => get().active[key] === true
}))
