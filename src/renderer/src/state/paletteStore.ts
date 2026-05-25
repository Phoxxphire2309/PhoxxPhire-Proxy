import { create } from 'zustand'

interface PaletteState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

/** Open/closed state for the ⌘K command palette. */
export const usePaletteStore = create<PaletteState>((set, get) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set({ open: !get().open })
}))
