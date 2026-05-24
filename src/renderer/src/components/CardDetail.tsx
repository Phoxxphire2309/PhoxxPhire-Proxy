import { useEffect, useRef, useState } from 'react'
import {
  bestPrinting,
  bestUsd,
  faceImageUrl,
  formatUsd,
  isHighRes,
  type Card
} from '@shared/scryfall'
import { usePrintingStore } from '@renderer/state/printingStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { upscaleCardWithConfirm } from '@renderer/state/upscaleActions'
import { useDeckStore } from '@renderer/state/deckStore'

export function CardDetail(): React.JSX.Element | null {
  const detailCard = usePrintingStore((state) => state.detailCard)
  const close = usePrintingStore((state) => state.close)
  const choose = usePrintingStore((state) => state.choose)
  const addToDeck = useDeckStore((state) => state.add)
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const scale = useUpscaleStore((state) => state.scale)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)

  const [printings, setPrintings] = useState<Card[]>([])
  const [loadingPrintings, setLoadingPrintings] = useState(false)
  const [faceIndex, setFaceIndex] = useState(0)
  const [compare, setCompare] = useState(50)
  const [dragging, setDragging] = useState(false)
  const compareRef = useRef<HTMLDivElement>(null)

  // Map a pointer X position to a 0–100 split across the comparison image.
  const setCompareFromX = (clientX: number): void => {
    const el = compareRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setCompare(Math.min(100, Math.max(0, pct)))
  }

  const displayed = detailCard
  const oracleId = displayed?.oracleId ?? null

  // Close on Escape.
  useEffect(() => {
    if (!detailCard) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailCard, close])

  // Reset the viewed face when switching to a different card.
  useEffect(() => setFaceIndex(0), [detailCard?.id])

  // Load all printings for the displayed card's oracle id.
  useEffect(() => {
    if (!oracleId) {
      setPrintings([])
      return
    }
    let active = true
    setLoadingPrintings(true)
    window.phoxx
      .getPrintings(oracleId)
      .then((result) => active && setPrintings(result))
      .catch(() => active && setPrintings([]))
      .finally(() => active && setLoadingPrintings(false))
    return () => {
      active = false
    }
  }, [oracleId])

  if (!displayed) return null

  const face = displayed.faces[faceIndex] ?? displayed.faces[0]
  const isDoubleFaced = displayed.faces.length > 1
  // Best-quality printing for upscaling: offer a switch when a higher-res scan exists.
  const best = bestPrinting(printings)
  const betterAvailable =
    best !== null && best.id !== displayed.id && isHighRes(best) && !isHighRes(displayed)
  const upscaled = Boolean(upscaledSet[displayed.id])
  const showCompare = upscalerAvailable && upscaled
  const sourceSrc = faceImageUrl(displayed.id, faceIndex, 'source')
  const upscaledSrc = faceImageUrl(displayed.id, faceIndex, 'upscaled', settingsVersion)

  return (
    <div
      className="detail"
      role="dialog"
      aria-modal="true"
      aria-label={`${displayed.name} details`}
    >
      {/* A real button as the backdrop keeps click-to-dismiss accessible (Escape also closes). */}
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={close} />
      <div className="detail__panel">
        <button className="detail__close" type="button" onClick={close} aria-label="Close">
          ✕
        </button>

        <div className="detail__main">
          {showCompare ? (
            <div
              className={`compare${dragging ? ' is-dragging' : ''}`}
              ref={compareRef}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                setDragging(true)
                setCompareFromX(event.clientX)
              }}
              onPointerMove={(event) => {
                if (dragging) setCompareFromX(event.clientX)
              }}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
            >
              <img
                className="detail__image"
                src={upscaledSrc}
                alt={face?.name ?? displayed.name}
                draggable={false}
              />
              <div className="compare__top" style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}>
                <img
                  className="detail__image"
                  src={sourceSrc}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
              </div>
              <span className="compare__tag compare__tag--left">Original</span>
              <span className="compare__tag compare__tag--right">Upscaled {scale}×</span>
              <div className="compare__divider" style={{ left: `${compare}%` }}>
                <span
                  className="compare__handle"
                  role="slider"
                  tabIndex={0}
                  aria-label="Compare original and upscaled"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(compare)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft') setCompare((c) => Math.max(0, c - 2))
                    else if (event.key === 'ArrowRight') setCompare((c) => Math.min(100, c + 2))
                    else if (event.key === 'Home') setCompare(0)
                    else if (event.key === 'End') setCompare(100)
                  }}
                />
              </div>
            </div>
          ) : (
            <img
              className="detail__image"
              src={sourceSrc}
              alt={face?.name ?? displayed.name}
              draggable={false}
            />
          )}

          <div className="detail__info">
            <h2 className="detail__name">{face?.name ?? displayed.name}</h2>
            <p className="detail__meta">
              {displayed.setCode.toUpperCase()} · #{displayed.collectorNumber} · {displayed.layout}
              {displayed.imageStatus !== undefined && (
                <span
                  className={`quality ${isHighRes(displayed) ? 'quality--hd' : 'quality--low'}`}
                >
                  {isHighRes(displayed) ? 'HD scan' : 'Low-res scan'}
                </span>
              )}
            </p>
            {betterAvailable && best && (
              <button
                className="toggle"
                type="button"
                onClick={() => choose(best)}
                title="Switch to a higher-resolution printing for a sharper upscale"
              >
                ✦ Use best-quality printing ({best.setCode.toUpperCase()})
              </button>
            )}
            <p
              className="detail__price"
              title="Estimated market price from Scryfall, updated daily"
            >
              {formatUsd(bestUsd(displayed.prices))}
              {displayed.prices.usdFoil !== null && (
                <span className="detail__price-foil">
                  {' '}
                  · foil {formatUsd(displayed.prices.usdFoil)}
                </span>
              )}
            </p>

            <div className="detail__actions">
              <button className="toggle is-on" type="button" onClick={() => addToDeck(displayed)}>
                ＋ Add to deck
              </button>
              {upscalerAvailable && !upscaled && (
                <button
                  className="toggle"
                  type="button"
                  onClick={() => void upscaleCardWithConfirm(displayed)}
                >
                  Upscale {scale}×
                </button>
              )}
              {isDoubleFaced && (
                <button
                  className="toggle"
                  type="button"
                  onClick={() => setFaceIndex((index) => (index + 1) % displayed.faces.length)}
                >
                  ⤺ Flip face
                </button>
              )}
            </div>

            <h3 className="detail__sub">
              Printings{printings.length ? ` (${printings.length})` : ''}
            </h3>
            {loadingPrintings ? (
              <p className="detail__hint">Loading printings…</p>
            ) : printings.length <= 1 ? (
              <p className="detail__hint">No other printings found.</p>
            ) : (
              <ul className="prints">
                {printings.map((printing) => (
                  <li key={printing.id}>
                    <button
                      type="button"
                      className={`prints__item${printing.id === displayed.id ? ' is-active' : ''}`}
                      onClick={() => choose(printing)}
                      title={`${printing.setCode.toUpperCase()} · #${printing.collectorNumber}`}
                    >
                      <img
                        className="prints__thumb"
                        src={faceImageUrl(printing.id, 0, 'source')}
                        alt={`${printing.name} (${printing.setCode.toUpperCase()})`}
                        loading="lazy"
                        draggable={false}
                      />
                      <span className="prints__label">
                        {printing.setCode.toUpperCase()}
                        {isHighRes(printing) && <span className="prints__hd">HD</span>}
                      </span>
                      <span className="prints__price">{formatUsd(bestUsd(printing.prices))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
