import { useEffect, useState } from 'react'
import {
  computePageLayout,
  type BleedMode,
  type CardBackStyle,
  type ColorProfile,
  type CutGuideStyle,
  type Orientation,
  type PageSize
} from '@shared/layout'
import { faceImageUrl } from '@shared/scryfall'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'
import { useDeckStore } from '@renderer/state/deckStore'
import { toast } from '@renderer/state/toastStore'

const numeric = (value: string): number => Math.max(0, Number(value) || 0)

export function PageSetup({ onClose }: { onClose: () => void }): React.JSX.Element {
  const options = usePageSetupStore((state) => state.options)
  const set = usePageSetupStore((state) => state.set)
  const reset = usePageSetupStore((state) => state.reset)
  const items = useDeckStore((state) => state.items)
  const [hasCustomBack, setHasCustomBack] = useState(false)
  const [measuredMm, setMeasuredMm] = useState('')

  useEffect(() => {
    void window.phoxx.getCardBackInfo().then((info) => setHasCustomBack(info.hasCustom))
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const chooseCardBack = async (): Promise<void> => {
    try {
      const info = await window.phoxx.importCardBack()
      setHasCustomBack(info.hasCustom)
      if (info.hasCustom) {
        set('cardBack', 'custom')
        toast('Custom card back set', 'success')
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not set the card back', 'error')
    }
  }

  const layout = computePageLayout(options)
  const { pageWidthPt: pw, pageHeightPt: ph, perPage } = layout

  // Deck faces to fill the first page (source quality — preview never upscales).
  const faces: { cardId: string; faceIndex: number }[] = []
  for (const item of items) {
    if (item.section === 'maybeboard') continue
    for (let faceIndex = 0; faceIndex < item.quantities.length; faceIndex += 1) {
      for (let copy = 0; copy < item.quantities[faceIndex]!; copy += 1) {
        faces.push({ cardId: item.card.id, faceIndex })
      }
    }
  }

  const field = (
    label: string,
    key: 'bleedMm' | 'marginMm' | 'columnSpacingMm' | 'rowSpacingMm',
    max = 30
  ): React.JSX.Element => (
    <label className="export__field">
      <span>{label} (mm)</span>
      <input
        type="number"
        min={0}
        max={max}
        step={0.5}
        value={options[key]}
        onChange={(event) => set(key, numeric(event.target.value))}
      />
    </label>
  )

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Page setup">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel setup">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">Page setup</h2>

        <div className="setup__body">
          <div className="setup__form">
            <label className="export__field">
              <span>Page size</span>
              <select
                value={options.pageSize}
                onChange={(event) => set('pageSize', event.target.value as PageSize)}
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
                      set('customWidthMm', Math.max(50, numeric(event.target.value)))
                    }
                  />
                </label>
                <label className="export__field">
                  <span>Height (mm)</span>
                  <input
                    type="number"
                    min={50}
                    value={options.customHeightMm}
                    onChange={(event) =>
                      set('customHeightMm', Math.max(50, numeric(event.target.value)))
                    }
                  />
                </label>
              </>
            )}

            {field('Bleed', 'bleedMm', 6)}
            {field('Margin', 'marginMm')}
            {field('Column spacing', 'columnSpacingMm')}
            {field('Row spacing', 'rowSpacingMm')}

            {options.bleedMm > 0 && (
              <label className="export__field">
                <span>Bleed style</span>
                <select
                  value={options.bleedMode}
                  onChange={(event) => set('bleedMode', event.target.value as BleedMode)}
                >
                  <option value="solid">Solid border colour (recommended)</option>
                  <option value="extend">Extend edges</option>
                  <option value="zoom">Zoom card</option>
                </select>
              </label>
            )}

            <label className="export__field">
              <span>Cut guides</span>
              <select
                value={options.cutGuideStyle}
                onChange={(event) => set('cutGuideStyle', event.target.value as CutGuideStyle)}
              >
                <option value="none">None</option>
                <option value="outline">Outline</option>
                <option value="corners">Corner marks</option>
              </select>
            </label>

            <label className="export__field">
              <span>Card backs (duplex)</span>
              <select
                value={options.cardBack}
                onChange={(event) => set('cardBack', event.target.value as CardBackStyle)}
              >
                <option value="none">None</option>
                <option value="plain">Plain dark</option>
                <option value="custom">Custom image</option>
              </select>
            </label>

            {options.cardBack === 'custom' && (
              <div className="cardback">
                <button className="toggle" type="button" onClick={() => void chooseCardBack()}>
                  {hasCustomBack ? 'Replace back image…' : 'Choose back image…'}
                </button>
                <span className="detail__hint">
                  {hasCustomBack
                    ? 'Custom back installed ✓'
                    : 'No image chosen yet — exports fall back to the plain back.'}
                </span>
              </div>
            )}

            <label className="export__field">
              <span>Printer colour</span>
              <select
                value={options.colorProfile}
                onChange={(event) => set('colorProfile', event.target.value as ColorProfile)}
              >
                <option value="none">None (print as-is)</option>
                <option value="inkjet">Optimise for inkjet</option>
                <option value="laser">Optimise for laser</option>
              </select>
            </label>

            <label className="export__field export__field--inline">
              <input
                type="checkbox"
                checked={options.watermark}
                onChange={(event) => set('watermark', event.target.checked)}
              />
              <span>“PROXY” watermark</span>
            </label>

            <label className="export__field">
              <span>Print scale (%)</span>
              <input
                type="number"
                min={50}
                max={150}
                step={0.1}
                value={options.scalePercent}
                onChange={(event) =>
                  set(
                    'scalePercent',
                    Math.min(150, Math.max(50, Number(event.target.value) || 100))
                  )
                }
              />
            </label>

            <div className="cardback">
              <span className="detail__hint">
                Calibration: print the calibration page, measure the 100&nbsp;mm square, and enter
                what it actually measured to auto-set the scale.
              </span>
              <input
                className="search__input"
                type="number"
                step={0.1}
                placeholder="measured mm (was 100)"
                value={measuredMm}
                onChange={(event) => {
                  setMeasuredMm(event.target.value)
                  const mm = Number(event.target.value)
                  if (mm > 0) set('scalePercent', Math.round((10000 / mm) * 10) / 10)
                }}
                aria-label="Measured size of the 100mm calibration square"
              />
            </div>

            <button className="toggle" type="button" onClick={reset}>
              Reset to defaults
            </button>
          </div>

          <div className="setup__preview">
            <p className="preview__meta">
              {perPage} per page · page 1 of{' '}
              {Math.max(1, Math.ceil(faces.length / Math.max(1, perPage)))}
            </p>
            <div className="preview__page" style={{ aspectRatio: `${pw} / ${ph}` }}>
              {layout.slots.map((slot, slotIndex) => {
                const face = faces[slotIndex]
                return (
                  <div
                    key={slotIndex}
                    className="setup__slot"
                    style={{
                      left: `${(slot.cut.x / pw) * 100}%`,
                      top: `${(slot.cut.y / ph) * 100}%`,
                      width: `${(slot.cut.width / pw) * 100}%`,
                      height: `${(slot.cut.height / ph) * 100}%`
                    }}
                  >
                    {face && (
                      <img
                        src={faceImageUrl(face.cardId, face.faceIndex, 'source')}
                        alt=""
                        loading="lazy"
                        draggable={false}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
