import { useEffect, useState } from 'react'
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
import { Onboarding } from '@renderer/components/Onboarding'
import logo from '@renderer/assets/phoxxphire-logo.png'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useUiStore } from '@renderer/state/uiStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { loadPersistedState, startPersisting } from '@renderer/state/persist'

export function App(): React.JSX.Element {
  const loadSettings = useUpscaleStore((state) => state.loadSettings)
  const applyStatus = useUpscaleStore((state) => state.applyStatus)
  const theme = useUiStore((state) => state.theme)
  const toggleTheme = useUiStore((state) => state.toggleTheme)
  const view = useUiStore((state) => state.view)
  const detailCard = usePrintingStore((state) => state.detailCard)
  const detailOrigin = usePrintingStore((state) => state.origin)
  const setOnboarded = useUiStore((state) => state.setOnboarded)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Load settings + persisted state, then begin persisting changes.
  useEffect(() => {
    let stop: (() => void) | undefined
    const unsubscribeStatus = window.phoxx.onUpscaleStatus(applyStatus)
    void (async () => {
      await loadSettings()
      await loadPersistedState()
      stop = startPersisting()
      // First-run guide, once we know whether it's been seen.
      if (!useUiStore.getState().onboarded) setShowOnboarding(true)
    })()
    return () => {
      unsubscribeStatus()
      stop?.()
    }
  }, [loadSettings, applyStatus])

  const dismissOnboarding = (): void => {
    setOnboarded(true)
    setShowOnboarding(false)
  }

  // Cmd/Ctrl+K focuses the search box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.getElementById('card-search')?.focus()
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
        <header className="topbar">
          {view === 'search' && <SearchBar />}
          {view !== 'search' && <div className="topbar__spacer" />}
          <div className="topbar__right">
            <button
              className="rail__btn"
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle light/dark theme"
              title="Toggle theme"
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
            <button
              className="rail__btn"
              type="button"
              onClick={() => setShowOnboarding(true)}
              aria-label="Help / quick tour"
              title="Quick tour"
            >
              ?
            </button>
          </div>
        </header>

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
      {showOnboarding && <Onboarding onClose={dismissOnboarding} />}
    </div>
  )
}
