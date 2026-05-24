import type { AppState } from '@shared/appState'
import { useDeckStore } from '@renderer/state/deckStore'
import { useDecksStore } from '@renderer/state/decksStore'
import { useCollectionStore } from '@renderer/state/collectionStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useUiStore } from '@renderer/state/uiStore'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'

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
  if (state.onboarded) useUiStore.getState().setOnboarded(true)
  if (state.decks && state.decks.length > 0) {
    useDecksStore.getState().restore(state.decks, state.activeDeckId ?? state.decks[0]!.id)
  } else if (state.deck) {
    useDeckStore.getState().setItems(state.deck)
  }
  if (state.pageSetup) usePageSetupStore.getState().replace(state.pageSetup)
  if (state.collection) {
    useCollectionStore.getState().restore(state.collection.owned, state.collection.skipOwned)
  }
  // showSource is intentionally not restored — the view always starts on
  // "Original" so a saved "Upscaled" preference can't auto-upscale on launch.
  if (state.upscale) {
    await useUpscaleStore.getState().setSettings(state.upscale)
  }
}

function snapshot(): AppState {
  const upscale = useUpscaleStore.getState()
  const ui = useUiStore.getState()
  // Fold the live active-deck cards into the tabs before snapshotting.
  useDecksStore.getState().commitActive()
  const { tabs, activeId } = useDecksStore.getState()
  return {
    deck: useDeckStore.getState().items, // legacy fallback
    decks: tabs,
    activeDeckId: activeId,
    upscale: { model: upscale.model, scale: upscale.scale },
    theme: ui.theme,
    onboarded: ui.onboarded,
    pageSetup: usePageSetupStore.getState().options,
    collection: {
      owned: Object.keys(useCollectionStore.getState().owned),
      skipOwned: useCollectionStore.getState().skipOwned
    }
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
    useDecksStore.subscribe(schedule),
    useCollectionStore.subscribe(schedule),
    useUpscaleStore.subscribe(schedule),
    useUiStore.subscribe(schedule),
    usePageSetupStore.subscribe(schedule)
  ]

  return () => {
    clearTimeout(timer)
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}
