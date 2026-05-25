import type { AppState } from '@shared/appState'
import type { GroupBy } from '@shared/deckGroup'
import type { DeckSortKey } from '@shared/deckSort'
import type { SortKey } from '@shared/scryfallQuery'
import { useDeckStore } from '@renderer/state/deckStore'
import { useDecksStore } from '@renderer/state/decksStore'
import { useCollectionStore } from '@renderer/state/collectionStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useUiStore, type AppView } from '@renderer/state/uiStore'
import { useSearchStore, type ViewMode } from '@renderer/state/searchStore'
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
  if (state.ui?.view) useUiStore.getState().setView(state.ui.view as AppView)
  if (state.ui?.deckGroupBy) useUiStore.getState().setDeckGroupBy(state.ui.deckGroupBy as GroupBy)
  if (state.ui?.deckSortBy) useUiStore.getState().setDeckSortBy(state.ui.deckSortBy as DeckSortKey)
  // Set sort/view mode directly so restoring doesn't fire a search on launch.
  if (state.ui?.sort) useSearchStore.setState({ sort: state.ui.sort as SortKey })
  if (state.ui?.viewMode) useSearchStore.setState({ viewMode: state.ui.viewMode as ViewMode })
  if (state.decks && state.decks.length > 0) {
    useDecksStore.getState().restore(state.decks, state.activeDeckId ?? state.decks[0]!.id)
  } else if (state.deck) {
    useDeckStore.getState().setItems(state.deck)
  }
  if (state.pageSetup) usePageSetupStore.getState().replace(state.pageSetup)
  if (state.pagePresets) usePageSetupStore.getState().restorePresets(state.pagePresets)
  if (state.collection) {
    useCollectionStore.getState().restore(state.collection.owned, state.collection.skipOwned)
  }
  // showSource is intentionally not restored — the view always starts on
  // "Original" so a saved "Upscaled" preference can't auto-upscale on launch.
  if (state.upscale) {
    await useUpscaleStore.getState().setSettings(state.upscale)
  }
  // Restore which cards were upscaled (the images are still on disk) so deck
  // health doesn't re-flag them as low-res. This only sets the flag; it never
  // triggers a fresh upscale on launch.
  if (state.upscaledCardIds && state.upscaledCardIds.length > 0) {
    useUpscaleStore.getState().markManyUpscaled(state.upscaledCardIds)
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
    upscaledCardIds: Object.keys(upscale.upscaled),
    theme: ui.theme,
    onboarded: ui.onboarded,
    pageSetup: usePageSetupStore.getState().options,
    pagePresets: usePageSetupStore.getState().presets,
    collection: {
      owned: Object.keys(useCollectionStore.getState().owned),
      skipOwned: useCollectionStore.getState().skipOwned
    },
    ui: {
      view: ui.view,
      deckGroupBy: ui.deckGroupBy,
      deckSortBy: ui.deckSortBy,
      sort: useSearchStore.getState().sort,
      viewMode: useSearchStore.getState().viewMode
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
    useSearchStore.subscribe(schedule),
    usePageSetupStore.subscribe(schedule)
  ]

  return () => {
    clearTimeout(timer)
    unsubscribers.forEach((unsubscribe) => unsubscribe())
  }
}
