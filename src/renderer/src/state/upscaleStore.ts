import { create } from 'zustand'
import type { UpscaleStatus, UpscaleStatusEvent } from '@shared/ipc'

export const faceKey = (cardId: string, faceIndex: number): string => `${cardId}:${faceIndex}`

interface UpscaleState {
  /** null until queried; false when the Real-ESRGAN binary is not provisioned. */
  available: boolean | null
  /** Global before/after toggle: when true, tiles show the raw Scryfall image. */
  showSource: boolean
  model: string
  scale: number
  /** Bumped whenever settings change, to bust cached <img> URLs. */
  settingsVersion: number
  statuses: Record<string, UpscaleStatus>
  setAvailable: (available: boolean) => void
  toggleShowSource: () => void
  setShowSource: (showSource: boolean) => void
  applyStatus: (event: UpscaleStatusEvent) => void
  loadSettings: () => Promise<void>
  setSettings: (settings: { model?: string; scale?: number }) => Promise<void>
}

export const useUpscaleStore = create<UpscaleState>((set, get) => ({
  available: null,
  showSource: false,
  model: 'realesrgan-x4plus',
  scale: 2,
  settingsVersion: 0,
  statuses: {},
  setAvailable: (available) => set({ available }),
  toggleShowSource: () => set((state) => ({ showSource: !state.showSource })),
  setShowSource: (showSource) => set({ showSource }),
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
      settingsVersion: state.settingsVersion + 1
    }))
  }
}))
