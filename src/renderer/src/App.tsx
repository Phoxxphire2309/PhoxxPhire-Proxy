import { useEffect, useState } from 'react'
import { SearchBar } from '@renderer/components/SearchBar'
import { Filters } from '@renderer/components/Filters'
import { CardGrid } from '@renderer/components/CardGrid'
import { CardDetail } from '@renderer/components/CardDetail'
import { DeckPanel } from '@renderer/components/DeckPanel'
import { DeckTabs } from '@renderer/components/DeckTabs'
import { UpscaleControls } from '@renderer/components/UpscaleControls'
import { ToastContainer } from '@renderer/components/ToastContainer'
import { UpscaleProgress } from '@renderer/components/UpscaleProgress'
import { BulkProgress } from '@renderer/components/BulkProgress'
import { ConfirmHost } from '@renderer/components/ConfirmHost'
import { PrintPartner } from '@renderer/components/PrintPartner'
import { Onboarding } from '@renderer/components/Onboarding'
import logo from '@renderer/assets/phoxxphire-logo.png'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useUiStore } from '@renderer/state/uiStore'
import { loadPersistedState, startPersisting } from '@renderer/state/persist'

export function App(): React.JSX.Element {
  const loadSettings = useUpscaleStore((state) => state.loadSettings)
  const applyStatus = useUpscaleStore((state) => state.applyStatus)
  const theme = useUiStore((state) => state.theme)
  const toggleTheme = useUiStore((state) => state.toggleTheme)
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
      <header className="app__header">
        <div className="app__toolbar">
          <SearchBar />
          <Filters />
          <PrintPartner compact />
          <UpscaleControls />
          <button
            className="toggle"
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle light/dark theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
          <button
            className="toggle"
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
        <main className="app__results">
          <CardGrid />
        </main>
        <aside className="app__deck">
          <DeckTabs />
          <DeckPanel />
        </aside>
      </div>

      <CardDetail />
      <ToastContainer />
      <UpscaleProgress />
      <BulkProgress />
      <ConfirmHost />
      {showOnboarding && <Onboarding onClose={dismissOnboarding} />}
    </div>
  )
}
