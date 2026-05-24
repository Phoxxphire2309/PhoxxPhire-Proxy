import { useEffect } from 'react'
import {
  computePageLayout,
  type BleedMode,
  type CutGuideStyle,
  type Orientation,
  type PageSize
} from '@shared/layout'
import { faceImageUrl } from '@shared/scryfall'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'
import { useDeckStore } from '@renderer/state/deckStore'

const numeric = (value: string): number => Math.max(0, Number(value) || 0)

export function PageSetup({ onClose }: { onClose: () => void }): React.JSX.Element {
  const options = usePageSetupStore((state) => state.options)
  const set = usePageSetupStore((state) => state.set)
  const reset = usePageSetupStore((state) => state.reset)
  const items = useDeckStore((state) => state.items)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const layout = computePageLayout(options)
  const { pageWidthPt: pw, pageHeightPt: ph, perPage } = layout

  // Deck faces to fill the first page (source quality — preview never upscales).
  const faces: { cardId: string; faceIndex: number }[] = []
  for (const item of items) {
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

            <label className="export__field export__field--inline">
              <input
                type="checkbox"
                checked={options.cardBack !== 'none'}
                onChange={(event) => set('cardBack', event.target.checked ? 'plain' : 'none')}
              />
              <span>Card backs (duplex)</span>
            </label>

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
