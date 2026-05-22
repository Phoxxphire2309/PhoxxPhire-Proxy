import { create } from 'zustand'
import { faceImageUrl } from '@shared/scryfall'
import type { UpscaleStatus, UpscaleStatusEvent } from '@shared/ipc'

export const faceKey = (cardId: string, faceIndex: number): string => `${cardId}:${faceIndex}`

interface UpscaleState {
  /** null until queried; false when the Real-ESRGAN binary is not provisioned. */
  available: boolean | null
  /** Cards the user has chosen to upscale (id -> true). Session-only, not persisted. */
  upscaled: Record<string, true>
  model: string
  scale: number
  /** Bumped whenever settings change, to bust cached <img> URLs. */
  settingsVersion: number
  statuses: Record<string, UpscaleStatus>
  /** Active blocking upscale job (drives the progress popup), or null when idle. */
  job: { total: number; done: number } | null
  setAvailable: (available: boolean) => void
  markUpscaled: (cardId: string) => void
  unmarkUpscaled: (cardId: string) => void
  markManyUpscaled: (cardIds: string[]) => void
  /** Mark the given faces' cards upscaled and warm their images, showing a blocking popup. */
  runUpscale: (faces: { cardId: string; faceIndex: number }[]) => void
  applyStatus: (event: UpscaleStatusEvent) => void
  loadSettings: () => Promise<void>
  setSettings: (settings: { model?: string; scale?: number }) => Promise<void>
}

export const useUpscaleStore = create<UpscaleState>((set, get) => ({
  available: null,
  upscaled: {},
  model: 'realesrgan-x4plus',
  scale: 2,
  settingsVersion: 0,
  statuses: {},
  job: null,
  setAvailable: (available) => set({ available }),

  markUpscaled: (cardId) => set((state) => ({ upscaled: { ...state.upscaled, [cardId]: true } })),
  unmarkUpscaled: (cardId) =>
    set((state) => {
      const next = { ...state.upscaled }
      delete next[cardId]
      return { upscaled: next }
    }),
  markManyUpscaled: (cardIds) =>
    set((state) => {
      const next = { ...state.upscaled }
      for (const id of cardIds) next[id] = true
      return { upscaled: next }
    }),

  runUpscale: (faces) => {
    if (faces.length === 0) return
    set((state) => {
      const upscaled = { ...state.upscaled }
      for (const face of faces) upscaled[face.cardId] = true
      return { upscaled, job: { total: faces.length, done: 0 } }
    })
    const version = get().settingsVersion
    let done = 0
    // Image load (or error) is the completion signal, so this works for cache
    // hits as well as fresh upscales that the protocol handler produces on demand.
    const tick = (): void => {
      done += 1
      if (done >= faces.length) set({ job: null })
      else set({ job: { total: faces.length, done } })
    }
    for (const face of faces) {
      const img = new Image()
      img.onload = tick
      img.onerror = tick
      img.src = faceImageUrl(face.cardId, face.faceIndex, 'upscaled', version)
    }
  },

  applyStatus: (event) =>
    set((state) => ({
      statuses: { ...state.statuses, [faceKey(event.cardId, event.faceIndex)]: event.status }
    })),

  loadSettings: async () => {
    const settings = await window.phoxx.getUpscaleSettings()
    set({ available: settings.available, model: settings.model, scale: settings.scale })
  },

  setSettings: async (settings) => {
    const current = get()
    const applied = await window.phoxx.setUpscaleSettings({
      model: settings.model ?? current.model,
      scale: settings.scale ?? current.scale
    })
    set((state) => ({
      model: applied.model,
      scale: applied.scale,
      // Changing settings invalidates existing upscales; bump the cache-bust key.
      settingsVersion: state.settingsVersion + 1
    }))
  }
}))
