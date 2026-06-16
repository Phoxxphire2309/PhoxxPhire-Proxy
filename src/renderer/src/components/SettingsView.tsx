import { useEffect, useState } from 'react'
import { UPSCALE_MODELS } from '@shared/ipc'
import type { InstallPhase } from '@shared/upscaleInstall'
import { FORMAT_BAN_FILTERS, GENERAL_PRINTING_FILTERS } from '@shared/printingFilters'
import { usePrintingFiltersStore } from '@renderer/state/printingFiltersStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useUiStore } from '@renderer/state/uiStore'
import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { toast } from '@renderer/state/toastStore'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

const INSTALL_LABELS: Record<InstallPhase, string> = {
  downloading: 'Downloading…',
  extracting: 'Extracting…',
  installing: 'Installing…',
  done: 'Finishing…'
}

/** A labelled settings row: title + description on the left, control on the right. */
function Setting({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="setting">
      <div className="setting__info">
        <span className="setting__title">{title}</span>
        <span className="setting__desc">{description}</span>
      </div>
      <div className="setting__control">{children}</div>
    </div>
  )
}

/** The Settings view: appearance, upscaler, image cache, printing, and about. */
export function SettingsView(): React.JSX.Element {
  const theme = useUiStore((state) => state.theme)
  const setTheme = useUiStore((state) => state.setTheme)
  const activeFilters = usePrintingFiltersStore((state) => state.active)
  const toggleFilter = usePrintingFiltersStore((state) => state.toggle)
  const resetFilters = usePrintingFiltersStore((state) => state.reset)
  const available = useUpscaleStore((state) => state.available)
  const model = useUpscaleStore((state) => state.model)
  const scale = useUpscaleStore((state) => state.scale)
  const setSettings = useUpscaleStore((state) => state.setSettings)
  const loadSettings = useUpscaleStore((state) => state.loadSettings)
  const openModal = useDeckUiStore((state) => state.open)
  const setTourOpen = useUiStore((state) => state.setTourOpen)
  const setChangelogOpen = useUiStore((state) => state.setChangelogOpen)

  const [cacheBytes, setCacheBytes] = useState<number | null>(null)
  const [cachePath, setCachePath] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [installPhase, setInstallPhase] = useState<InstallPhase | null>(null)
  const [version, setVersion] = useState('')

  const refreshCache = (): void => {
    window.phoxx
      .getCacheInfo()
      .then((info) => {
        setCacheBytes(info.bytes)
        setCachePath(info.path)
      })
      .catch(() => setCacheBytes(null))
  }

  useEffect(() => {
    refreshCache()
    void window.phoxx.getVersion().then(setVersion)
    return window.phoxx.onUpscaleInstallProgress(setInstallPhase)
  }, [])

  const installUpscaler = async (): Promise<void> => {
    setInstallPhase('downloading')
    try {
      await window.phoxx.installUpscaler()
      await loadSettings()
      refreshCache()
      toast('Upscaler installed', 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Install failed', 'error')
    } finally {
      setInstallPhase(null)
    }
  }

  const runCacheOp = async (op: () => Promise<{ bytes: number; path: string }>): Promise<void> => {
    setBusy(true)
    try {
      const info = await op()
      setCacheBytes(info.bytes)
      setCachePath(info.path)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Cache operation failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings">
      <h1 className="grid__heading">Settings</h1>
      <p className="grid__count">Appearance, upscaling, cache, and printing.</p>

      <section className="settings__card">
        <h2 className="settings__title">Appearance</h2>
        <Setting title="Theme" description="Light or dark interface.">
          <div className="segmented" role="group" aria-label="Theme">
            <button
              type="button"
              className={theme === 'dark' ? 'is-on' : ''}
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
            >
              ☾ Dark
            </button>
            <button
              type="button"
              className={theme === 'light' ? 'is-on' : ''}
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
            >
              ☀ Light
            </button>
          </div>
        </Setting>
      </section>

      <section className="settings__card">
        <h2 className="settings__title">Upscaling</h2>
        {available === true ? (
          <>
            <Setting title="Model" description="General art, or anime/illustration frames.">
              <select
                value={model}
                onChange={(event) => void setSettings({ model: event.target.value })}
              >
                {UPSCALE_MODELS.map((name) => (
                  <option key={name} value={name}>
                    {name === 'realesrgan-x4plus-anime' ? 'Anime / illustration' : 'General'}
                  </option>
                ))}
              </select>
            </Setting>
            <Setting
              title="Output scale"
              description="2× ≈ 600 DPI (the print sweet spot); 4× is sharpest but larger."
            >
              <select
                value={scale}
                onChange={(event) => void setSettings({ scale: Number(event.target.value) })}
              >
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </Setting>
          </>
        ) : (
          <Setting
            title="Real-ESRGAN engine"
            description="Download the GPU upscaler (~50 MB) to sharpen card art before printing."
          >
            <button
              className="search__button"
              type="button"
              onClick={() => void installUpscaler()}
              disabled={installPhase !== null}
            >
              {installPhase ? INSTALL_LABELS[installPhase] : 'Install upscaler'}
            </button>
          </Setting>
        )}
      </section>

      <section className="settings__card">
        <h2 className="settings__title">Image cache</h2>
        <Setting
          title="Cached images"
          description={cachePath ? cachePath : 'Downloaded card art and upscales.'}
        >
          <span className="setting__metric">
            {cacheBytes === null ? '—' : formatBytes(cacheBytes)}
          </span>
        </Setting>
        <div className="setting__actions">
          <button
            className="toggle"
            type="button"
            disabled={busy || cacheBytes === 0}
            onClick={() => void runCacheOp(() => window.phoxx.rebuildImageCache())}
            title="Drop cached images so they re-download with the latest fixes (keeps your searched cards)"
          >
            Rebuild
          </button>
          <button
            className="toggle"
            type="button"
            disabled={busy || cacheBytes === 0}
            onClick={() => void runCacheOp(() => window.phoxx.clearCache())}
            title="Delete everything cached (images and card data)"
          >
            Clear all
          </button>
        </div>
      </section>

      <section className="settings__card">
        <h2 className="settings__title">Printing</h2>
        <Setting
          title="Page setup"
          description="Page size, bleed, cut guides, margins, scale, and card backs."
        >
          <button className="toggle" type="button" onClick={() => openModal('pageSetup')}>
            Open…
          </button>
        </Setting>
      </section>

      <section className="settings__card">
        <h2 className="settings__title">Printing filters</h2>
        <p className="settings__hint">
          Hide unwanted versions when choosing a card’s art and when switching every printing in
          bulk. Hidden printings stay reachable via “Show filtered printings” in card detail.
        </p>
        <div className="pfilters">
          {GENERAL_PRINTING_FILTERS.map((filter) => (
            <label key={filter.key} className="pfilters__item">
              <input
                type="checkbox"
                checked={activeFilters[filter.key] === true}
                onChange={() => toggleFilter(filter.key)}
              />
              <span>{filter.label}</span>
            </label>
          ))}
          <span className="pfilters__group">Hide cards banned in</span>
          {FORMAT_BAN_FILTERS.map((filter) => (
            <label key={filter.key} className="pfilters__item">
              <input
                type="checkbox"
                checked={activeFilters[filter.key] === true}
                onChange={() => toggleFilter(filter.key)}
              />
              <span>{filter.label.replace('Banned in ', '')}</span>
            </label>
          ))}
        </div>
        {Object.keys(activeFilters).length > 0 && (
          <button className="toggle" type="button" onClick={resetFilters}>
            Clear all filters ({Object.keys(activeFilters).length})
          </button>
        )}
      </section>

      <section className="settings__card">
        <h2 className="settings__title">Help</h2>
        <Setting title="Quick tour" description="Replay the first-run walkthrough of the app.">
          <button className="toggle" type="button" onClick={() => setTourOpen(true)}>
            Start tour
          </button>
        </Setting>
        <Setting title="What’s new" description="See what changed in each version of the app.">
          <button className="toggle" type="button" onClick={() => setChangelogOpen(true)}>
            View changelog
          </button>
        </Setting>
      </section>

      <section className="settings__card settings__card--about">
        <h2 className="settings__title">About</h2>
        <p className="settings__hint">
          PhoxxPhire Proxy Maker{version ? ` v${version}` : ''} — print-ready MTG proxies with
          Real-ESRGAN upscaling. Card data &amp; images from{' '}
          <a href="https://scryfall.com" target="_blank" rel="noreferrer">
            Scryfall
          </a>
          . Not affiliated with Wizards of the Coast. For personal play-testing only.
        </p>
      </section>
    </div>
  )
}
