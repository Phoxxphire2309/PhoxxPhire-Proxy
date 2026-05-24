import { Fragment, useEffect, useRef } from 'react'
import {
  computePageLayout,
  pageCountFor,
  type CutGuideStyle,
  type ExportSlot,
  type Rect
} from '@shared/layout'
import { faceImageUrl } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'
import { useOrderStore } from '@renderer/state/orderStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'
import { toast } from '@renderer/state/toastStore'

/** A cut-guide overlay at the trim rectangle, matching the export style. */
function CutGuide({
  style,
  kind
}: {
  style: React.CSSProperties
  kind: CutGuideStyle
}): React.JSX.Element | null {
  if (kind === 'none') return null
  if (kind === 'outline') {
    return <div className="preview__cut preview__cut--outline" style={style} aria-hidden="true" />
  }
  return (
    <div className="preview__cut" style={style} aria-hidden="true">
      <span className="preview__cut-mark preview__cut-mark--tl" />
      <span className="preview__cut-mark preview__cut-mark--tr" />
      <span className="preview__cut-mark preview__cut-mark--bl" />
      <span className="preview__cut-mark preview__cut-mark--br" />
    </div>
  )
}

export function PrintPreview({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const slots = useOrderStore((state) => state.slots)
  const reorder = useOrderStore((state) => state.reorder)
  const addSpacer = useOrderStore((state) => state.addSpacer)
  const removeAt = useOrderStore((state) => state.removeAt)
  const syncFromDeck = useOrderStore((state) => state.syncFromDeck)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const options = usePageSetupStore((state) => state.options)

  const dragIndex = useRef<number | null>(null)

  const duplex = options.cardBack !== 'none'
  // Stable signature of the deck's quantities + duplex (which pairs DFC faces).
  const deckSignature =
    items.map((item) => `${item.card.id}:${item.quantities.join(',')}`).join('|') + `|${duplex}`

  useEffect(() => {
    syncFromDeck(items, duplex)
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
  // Cards with more than one face print their second face on the duplex back.
  const faceCounts = new Map(
    items.map((item) => [item.card.id, Math.max(1, item.card.faces.length)])
  )
  const pct = (value: number, total: number): string => `${(value / total) * 100}%`
  const rectStyle = (r: Rect): React.CSSProperties => ({
    left: pct(r.x, pw),
    top: pct(r.y, ph),
    width: pct(r.width, pw),
    height: pct(r.height, ph)
  })
  // Backs are X-mirrored so they line up with fronts under duplex printing.
  const mirrorStyle = (r: Rect): React.CSSProperties => ({
    left: pct(pw - (r.x + r.width), pw),
    top: pct(r.y, ph),
    width: pct(r.width, pw),
    height: pct(r.height, ph)
  })

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
          Drag cards to reorder. Shows bleed and cut guides exactly as exported
          {duplex
            ? '; back pages show the duplex reverse (two-faced cards use their second face).'
            : '.'}
        </p>

        <div className="preview__pages">
          {Array.from({ length: pageCount }).map((_, page) => (
            <Fragment key={page}>
              <div className="preview__page" style={{ aspectRatio: `${pw} / ${ph}` }}>
                {layout.slots.map((slot, slotIndex) => {
                  const globalIndex = page * layout.perPage + slotIndex
                  if (globalIndex >= slots.length) return null
                  const spec = slots[globalIndex]!
                  const isUpscaled = !spec.spacer && Boolean(upscaledSet[spec.cardId])
                  const dragProps = {
                    draggable: true,
                    onDragStart: () => {
                      dragIndex.current = globalIndex
                    },
                    onDragOver: (event: React.DragEvent) => event.preventDefault(),
                    onDrop: () => {
                      if (dragIndex.current !== null) reorder(dragIndex.current, globalIndex)
                      dragIndex.current = null
                    },
                    onDragEnd: () => {
                      dragIndex.current = null
                    }
                  }
                  return (
                    <Fragment key={slotIndex}>
                      {spec.spacer ? (
                        <div
                          className="preview__spacer"
                          style={rectStyle(slot.bleed)}
                          {...dragProps}
                        >
                          <button
                            type="button"
                            className="preview__spacer-remove"
                            onClick={() => removeAt(globalIndex)}
                            aria-label="Remove spacer"
                            title="Remove spacer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <img
                          className="preview__card"
                          src={faceImageUrl(
                            spec.cardId,
                            spec.faceIndex,
                            isUpscaled ? 'upscaled' : 'source',
                            isUpscaled ? settingsVersion : undefined
                          )}
                          alt=""
                          loading="lazy"
                          {...dragProps}
                          style={rectStyle(slot.bleed)}
                        />
                      )}
                      {!spec.spacer && (
                        <CutGuide style={rectStyle(slot.cut)} kind={options.cutGuideStyle} />
                      )}
                    </Fragment>
                  )
                })}
              </div>

              {duplex && (
                <div
                  className="preview__page preview__page--back"
                  style={{ aspectRatio: `${pw} / ${ph}` }}
                >
                  <span className="preview__page-tag">Back</span>
                  {layout.slots.map((slot, slotIndex) => {
                    const globalIndex = page * layout.perPage + slotIndex
                    if (globalIndex >= slots.length) return null
                    const spec = slots[globalIndex]!
                    if (spec.spacer) return null
                    const isUpscaled = Boolean(upscaledSet[spec.cardId])
                    const isDfc = (faceCounts.get(spec.cardId) ?? 1) > 1
                    return (
                      <Fragment key={slotIndex}>
                        {isDfc ? (
                          <img
                            className="preview__card"
                            src={faceImageUrl(
                              spec.cardId,
                              1,
                              isUpscaled ? 'upscaled' : 'source',
                              isUpscaled ? settingsVersion : undefined
                            )}
                            alt=""
                            loading="lazy"
                            style={mirrorStyle(slot.bleed)}
                          />
                        ) : (
                          <div className="preview__back" style={mirrorStyle(slot.bleed)}>
                            {options.cardBack === 'custom' ? 'Custom back' : 'Back'}
                          </div>
                        )}
                        <CutGuide style={mirrorStyle(slot.cut)} kind={options.cutGuideStyle} />
                      </Fragment>
                    )
                  })}
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <div className="import__actions preview__footer">
          <button className="toggle" type="button" onClick={addSpacer}>
            Add spacer
          </button>
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
