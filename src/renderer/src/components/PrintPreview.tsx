import { useEffect } from 'react'
import { computePageLayout, DEFAULT_EXPORT_OPTIONS, pageCountFor } from '@shared/layout'
import { faceImageUrl } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'

interface SlotSpec {
  cardId: string
  faceIndex: number
}

export function PrintPreview({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const layout = computePageLayout(DEFAULT_EXPORT_OPTIONS)
  const { pageWidthPt: pw, pageHeightPt: ph } = layout

  // One slot per copy per face (double-faced cards print both sides).
  const slots: SlotSpec[] = []
  for (const item of items) {
    const faceCount = Math.max(1, item.card.faces.length)
    for (let copy = 0; copy < item.quantity; copy += 1) {
      for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
        slots.push({ cardId: item.card.id, faceIndex })
      }
    }
  }
  const pageCount = pageCountFor(slots.length, layout.perPage)

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Print preview">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel preview">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">
          Print preview{' '}
          <span className="preview__meta">
            {slots.length} card{slots.length === 1 ? '' : 's'} · {pageCount} page
            {pageCount === 1 ? '' : 's'} · A4
          </span>
        </h2>
        <p className="detail__hint">
          Showing original art at the default A4 layout. Use Export for full options (page size,
          bleed, cut guides, duplex).
        </p>

        <div className="preview__pages">
          {Array.from({ length: pageCount }).map((_, page) => (
            <div key={page} className="preview__page" style={{ aspectRatio: `${pw} / ${ph}` }}>
              {layout.slots.map((slot, slotIndex) => {
                const globalIndex = page * layout.perPage + slotIndex
                if (globalIndex >= slots.length) return null
                const spec = slots[globalIndex]!
                return (
                  <img
                    key={slotIndex}
                    className="preview__card"
                    src={faceImageUrl(spec.cardId, spec.faceIndex, 'source')}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    style={{
                      left: `${(slot.bleed.x / pw) * 100}%`,
                      top: `${(slot.bleed.y / ph) * 100}%`,
                      width: `${(slot.bleed.width / pw) * 100}%`,
                      height: `${(slot.bleed.height / ph) * 100}%`
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
