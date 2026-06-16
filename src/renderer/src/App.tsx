import { useEffect } from 'react'
import { SearchBar } from '@renderer/components/SearchBar'
import { Sidebar } from '@renderer/components/Sidebar'
import { CardGrid } from '@renderer/components/CardGrid'
import { CardDetail } from '@renderer/components/CardDetail'
import { DeckGridView } from '@renderer/components/DeckGridView'
import { DeckActions } from '@renderer/components/DeckActions'
import { DeckDialogs } from '@renderer/components/DeckDialogs'
import { SettingsView } from '@renderer/components/SettingsView'
import { ToastContainer } from '@renderer/components/ToastContainer'
import { UpscaleProgress } from '@renderer/components/UpscaleProgress'
import { BulkProgress } from '@renderer/components/BulkProgress'
import { ConfirmHost } from '@renderer/components/ConfirmHost'
import { CommandPalette } from '@renderer/components/CommandPalette'
import { UpdateBanner } from '@renderer/components/UpdateBanner'
import { Onboarding } from '@renderer/components/Onboarding'
import { Changelog } from '@renderer/components/Changelog'
import logo from '@renderer/assets/phoxxphire-logo.png'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useUiStore } from '@renderer/state/uiStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { usePaletteStore } from '@renderer/state/paletteStore'
import { loadPersistedState, startPersisting } from '@renderer/state/persist'

export function App(): React.JSX.Element {
  const loadSettings = useUpscaleStore((state) => state.loadSettings)
  const applyStatus = useUpscaleStore((state) => state.applyStatus)
  const view = useUiStore((state) => state.view)
  const detailCard = usePrintingStore((state) => state.detailCard)
  const detailOrigin = usePrintingStore((state) => state.origin)
  const setOnboarded = useUiStore((state) => state.setOnboarded)
  const tourOpen = useUiStore((state) => state.tourOpen)
  const setTourOpen = useUiStore((state) => state.setTourOpen)
  const changelogOpen = useUiStore((state) => state.changelogOpen)
  const setChangelogOpen = useUiStore((state) => state.setChangelogOpen)

  // Load settings + persisted state, then begin persisting changes.
  useEffect(() => {
    let stop: (() => void) | undefined
    const unsubscribeStatus = window.phoxx.onUpscaleStatus(applyStatus)
    void (async () => {
      await loadSettings()
      await loadPersistedState()
      stop = startPersisting()
      const version = await window.phoxx.getVersion()
      if (!useUiStore.getState().onboarded) {
        // First-run guide, once we know whether it's been seen.
        setTourOpen(true)
      } else if (
        useUiStore.getState().lastSeenVersion &&
        useUiStore.getState().lastSeenVersion !== version
      ) {
        // Existing user opening a newer build — show what's new, once per version.
        useUiStore.getState().setChangelogOpen(true)
      }
      useUiStore.getState().setLastSeenVersion(version)
    })()
    return () => {
      unsubscribeStatus()
      stop?.()
    }
  }, [loadSettings, applyStatus, setTourOpen])

  const dismissOnboarding = (): void => {
    setOnboarded(true)
    setTourOpen(false)
  }

  // Cmd/Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        usePaletteStore.getState().toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <div className="app__bg" aria-hidden="true" style={{ backgroundImage: `url(${logo})` }} />

      <Sidebar />

      <div className="app__main">
        {view === 'search' && (
          <header className="topbar">
            <SearchBar />
          </header>
        )}

        <div className="app__body">
          {view === 'search' && (
            <>
              <main className="app__results">
                <CardGrid />
              </main>
              {detailCard && detailOrigin === 'grid' && (
                <aside className="app__deck app__deck--inspector">
                  <CardDetail variant="panel" />
                </aside>
              )}
            </>
          )}
          {view === 'decks' && (
            <>
              <main className="app__results">
                <DeckGridView />
              </main>
              <aside className="app__deck">
                <DeckActions />
              </aside>
            </>
          )}
          {view === 'settings' && (
            <main className="app__results">
              <SettingsView />
            </main>
          )}
        </div>
      </div>

      <DeckDialogs />
      {detailOrigin === 'deck' && <CardDetail />}
      <ToastContainer />
      <UpscaleProgress />
      <BulkProgress />
      <ConfirmHost />
      <CommandPalette />
      <UpdateBanner />
      {tourOpen && <Onboarding onClose={dismissOnboarding} />}
      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}
    </div>
  )
}
