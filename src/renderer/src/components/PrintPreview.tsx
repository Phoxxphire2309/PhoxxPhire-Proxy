import { useEffect, useRef } from 'react'
import { computePageLayout, pageCountFor, type ExportSlot } from '@shared/layout'
import { faceImageUrl } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'
import { useOrderStore } from '@renderer/state/orderStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'
import { toast } from '@renderer/state/toastStore'

export function PrintPreview({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const slots = useOrderStore((state) => state.slots)
  const reorder = useOrderStore((state) => state.reorder)
  const syncFromDeck = useOrderStore((state) => state.syncFromDeck)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const options = usePageSetupStore((state) => state.options)

  const dragIndex = useRef<number | null>(null)

  // Stable signature of the deck's quantities; rebuilds the order only when it changes.
  const deckSignature = items
    .map((item) => `${item.card.id}:${item.quantities.join(',')}`)
    .join('|')

  useEffect(() => {
    syncFromDeck(items)
    // The deck signature captures everything syncFromDeck reads; items/syncFromDeck are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSignature])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const layout = computePageLayout(options)
  const { pageWidthPt: pw, pageHeightPt: ph } = layout
  const pageCount = pageCountFor(slots.length, layout.perPage)

  const exportPdf = async (): Promise<void> => {
    const exportSlots: ExportSlot[] = slots.map((slot) => ({
      ...slot,
      upscale: Boolean(upscaledSet[slot.cardId])
    }))
    try {
      const outcome = await window.phoxx.exportPdf({ slots: exportSlots, options })
      if (outcome.canceled) return
      toast(`Saved ${outcome.cardCount} cards to ${outcome.path}`, 'success')
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed', 'error')
    }
  }

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
          Drag cards to reorder. Reflects your Page setup; cards you’ve upscaled show upscaled here,
          the rest stay original.
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
                    draggable
                    onDragStart={() => {
                      dragIndex.current = globalIndex
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (dragIndex.current !== null) reorder(dragIndex.current, globalIndex)
                      dragIndex.current = null
                    }}
                    onDragEnd={() => {
                      dragIndex.current = null
                    }}
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

        <div className="import__actions preview__footer">
          <button
            className="search__button"
            type="button"
            disabled={slots.length === 0}
            onClick={() => void exportPdf()}
          >
            Export PDF
          </button>
        </div>
      </div>
    </div>
  )
}
