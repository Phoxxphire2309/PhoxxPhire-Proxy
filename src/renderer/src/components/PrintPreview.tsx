import { useEffect } from 'react'
import { computePageLayout, pageCountFor } from '@shared/layout'
import { faceImageUrl } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'

interface SlotSpec {
  cardId: string
  faceIndex: number
}

export function PrintPreview({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const options = usePageSetupStore((state) => state.options)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const layout = computePageLayout(options)
  const { pageWidthPt: pw, pageHeightPt: ph } = layout

  // One slot per copy per face (each face has its own print quantity).
  const slots: SlotSpec[] = []
  for (const item of items) {
    for (let faceIndex = 0; faceIndex < item.quantities.length; faceIndex += 1) {
      for (let copy = 0; copy < item.quantities[faceIndex]!; copy += 1) {
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
            {pageCount === 1 ? '' : 's'} · {options.pageSize.toUpperCase()} {options.orientation}
          </span>
        </h2>
        <p className="detail__hint">
          Reflects your Page setup. Cards you’ve upscaled show upscaled here; the rest stay
          original.
        </p>

        <div className="preview__pages">
          {Array.from({ length: pageCount }).map((_, page) => (
            <div key={page} className="preview__page" style={{ aspectRatio: `${pw} / ${ph}` }}>
              {layout.slots.map((slot, slotIndex) => {
                const globalIndex = page * layout.perPage + slotIndex
                if (globalIndex >= slots.length) return null
                const spec = slots[globalIndex]!
                const isUpscaled = Boolean(upscaledSet[spec.cardId])
                return (
                  <img
                    key={slotIndex}
                    className="preview__card"
                    src={faceImageUrl(
                      spec.cardId,
                      spec.faceIndex,
                      isUpscaled ? 'upscaled' : 'source',
                      isUpscaled ? settingsVersion : undefined
                    )}
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
