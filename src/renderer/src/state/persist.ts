import type { AppState } from '@shared/appState'
import { useDeckStore } from '@renderer/state/deckStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useUiStore } from '@renderer/state/uiStore'

/** Restores persisted state into the stores. Call once at startup. */
export async function loadPersistedState(): Promise<void> {
  let state: AppState | null = null
  try {
    state = await window.phoxx.getAppState()
  } catch {
    return
  }
  if (!state) return

  if (state.theme) useUiStore.getState().setTheme(state.theme)
  if (state.deck) useDeckStore.getState().setItems(state.deck)
  if (typeof state.showSource === 'boolean') {
    useUpscaleStore.getState().setShowSource(state.showSource)
  }
  if (state.upscale) {
    await useUpscaleStore.getState().setSettings(state.upscale)
  }
}

function snapshot(): AppState {
  const deck = useDeckStore.getState()
  const upscale = useUpscaleStore.getState()
  const ui = useUiStore.getState()
  return {
    deck: deck.items,
    upscale: { model: upscale.model, scale: upscale.scale },
    showSource: upscale.showSource,
    theme: ui.theme
  }
}

/**
 * Subscribes to the persisted stores and saves a debounced snapshot on change.
 * Returns an unsubscribe function.
 */
export function startPersisting(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(() => void window.phoxx.setAppState(snapshot()), 400)
  }

  const unsubscribers = [
    useDeckStore.subscribe(schedule),
    useUpscaleStore.subscribe(schedule),
    useUiStore.subscribe(schedule)
  ]

  return () => {
    clearTimeout(timer)
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}
