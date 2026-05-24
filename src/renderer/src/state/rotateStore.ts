import { create } from 'zustand'

interface RotateState {
  /** Card ids that should print rotated 180°. */
  rotated: Record<string, true>
  toggle: (cardId: string) => void
  isRotated: (cardId: string) => boolean
}

/** Tracks which cards print rotated 180° (flip/Aftermath cards, alignment). */
export const useRotateStore = create<RotateState>((set, get) => ({
  rotated: {},
  toggle: (cardId) =>
    set((state) => {
      const rotated = { ...state.rotated }
      if (rotated[cardId]) delete rotated[cardId]
      else rotated[cardId] = true
      return { rotated }
    }),
  isRotated: (cardId) => get().rotated[cardId] === true
}))
