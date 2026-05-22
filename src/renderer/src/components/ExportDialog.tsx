import { useEffect, useState } from 'react'
import {
  DEFAULT_EXPORT_OPTIONS,
  type BleedMode,
  type CutGuideStyle,
  type ExportOptions,
  type ExportProgress,
  type Orientation,
  type PageSize
} from '@shared/layout'
import { useDeckStore } from '@renderer/state/deckStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'

type Phase = 'configure' | 'running' | 'done' | 'error'

export function ExportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS)
  const [phase, setPhase] = useState<Phase>('configure')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [message, setMessage] = useState<string>('')

  useEffect(() => {
    const unsubscribe = window.phoxx.onExportProgress(setProgress)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && phase !== 'running') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, phase])

  const totalCards = items.reduce(
    (sum, item) => sum + item.quantity * Math.max(1, item.card.faces.length),
    0
  )
  const cards = items.map((item) => ({
    id: item.card.id,
    quantity: item.quantity,
    upscale: Boolean(upscaledSet[item.card.id])
  }))
  const upscaledCount = cards.filter((card) => card.upscale).length

  const runGuarded = async (action: () => Promise<string | null>): Promise<void> => {
    setPhase('running')
    setProgress(null)
    try {
      const result = await action()
      if (result === null) {
        setPhase('configure')
        return
      }
      setMessage(result)
      setPhase('done')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed')
      setPhase('error')
    }
  }

  const exportPdf = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportPdf({ cards, options })
      return outcome.canceled
        ? null
        : `Saved ${outcome.cardCount} cards across ${outcome.pageCount} page(s) to ${outcome.path}`
    })

  const exportImages = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportImages(cards)
      return outcome.canceled ? null : `Saved ${outcome.count} card image(s) to ${outcome.path}`
    })

  const exportCalibration = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportCalibration(options)
      return outcome.canceled ? null : `Saved calibration page to ${outcome.path}`
    })

  const set = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]): void =>
    setOptions((current) => ({ ...current, [key]: value }))

  const running = phase === 'running'

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Export PDF">
      <button
        className="detail__backdrop"
        type="button"
        aria-label="Close"
        onClick={() => !running && onClose()}
      />
      <div className="detail__panel import">
        {!running && (
          <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        <h2 className="detail__name">Export</h2>

        {phase === 'done' || phase === 'error' ? (
          <>
            <p className={phase === 'error' ? 'export__error' : 'detail__hint'}>{message}</p>
            <div className="import__actions">
              <button className="search__button" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="detail__hint">
              {totalCards} card image(s) at 63×88mm
              {options.bleedMm > 0 ? ` · ${options.bleedMm}mm bleed` : ''}
              {options.cardBack !== 'none' ? ' · with card backs (duplex)' : ''}.
            </p>
            <p className="detail__hint">
              {upscaledCount === 0
                ? 'All cards export at original quality (use the Upscale buttons first).'
                : `${upscaledCount} of ${items.length} card type(s) will export upscaled; the rest stay original.`}
            </p>

            <div className="export__form">
              <label className="export__field">
                <span>Page size</span>
                <select
                  value={options.pageSize}
                  onChange={(event) => set('pageSize', event.target.value as PageSize)}
                  disabled={running}
                >
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                  <option value="legal">US Legal</option>
                  <option value="a3">A3</option>
                  <option value="custom">Custom</option>
                </select>
              </label>

              <label className="export__field">
                <span>Orientation</span>
                <select
                  value={options.orientation}
                  onChange={(event) => set('orientation', event.target.value as Orientation)}
                  disabled={running}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </label>

              {options.pageSize === 'custom' && (
                <>
                  <label className="export__field">
                    <span>Width (mm)</span>
                    <input
                      type="number"
                      min={50}
                      value={options.customWidthMm}
                      onChange={(event) =>
                        set('customWidthMm', Math.max(50, Number(event.target.value)))
                      }
                      disabled={running}
                    />
                  </label>
                  <label className="export__field">
                    <span>Height (mm)</span>
                    <input
                      type="number"
                      min={50}
                      value={options.customHeightMm}
                      onChange={(event) =>
                        set('customHeightMm', Math.max(50, Number(event.target.value)))
                      }
                      disabled={running}
                    />
                  </label>
                </>
              )}

              <label className="export__field">
                <span>Bleed (mm)</span>
                <input
                  type="number"
                  min={0}
                  max={6}
                  step={0.5}
                  value={options.bleedMm}
                  onChange={(event) => set('bleedMm', Math.max(0, Number(event.target.value)))}
                  disabled={running}
                />
              </label>

              {options.bleedMm > 0 && (
                <label className="export__field">
                  <span>Bleed style</span>
                  <select
                    value={options.bleedMode}
                    onChange={(event) => set('bleedMode', event.target.value as BleedMode)}
                    disabled={running}
                  >
                    <option value="extend">Extend art (mirror)</option>
                    <option value="zoom">Zoom card</option>
                  </select>
                </label>
              )}

              <label className="export__field">
                <span>Cut guides</span>
                <select
                  value={options.cutGuideStyle}
                  onChange={(event) => set('cutGuideStyle', event.target.value as CutGuideStyle)}
                  disabled={running}
                >
                  <option value="none">None</option>
                  <option value="outline">Outline</option>
                  <option value="corners">Corner marks</option>
                </select>
              </label>

              <label className="export__field export__field--inline">
                <input
                  type="checkbox"
                  checked={options.cardBack !== 'none'}
                  onChange={(event) => set('cardBack', event.target.checked ? 'plain' : 'none')}
                  disabled={running}
                />
                <span>Card backs (duplex)</span>
              </label>
            </div>

            {running && (
              <p className="detail__hint">
                {progress?.phase === 'rendering'
                  ? 'Rendering…'
                  : `Preparing ${progress?.completed ?? 0}/${progress?.total ?? totalCards}…`}
              </p>
            )}

            <div className="import__actions export__buttons">
              <button
                className="toggle"
                type="button"
                disabled={running}
                onClick={() => void exportCalibration()}
              >
                Calibration page
              </button>
              <button
                className="toggle"
                type="button"
                disabled={running || items.length === 0}
                onClick={() => void exportImages()}
              >
                Export images
              </button>
              <button
                className="search__button"
                type="button"
                disabled={running || items.length === 0}
                onClick={() => void exportPdf()}
              >
                {running ? 'Exporting…' : 'Export PDF'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
