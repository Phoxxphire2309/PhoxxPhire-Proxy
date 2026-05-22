import { useEffect, useState } from 'react'
import { bestUsd, faceImageUrl, formatUsd, type Card } from '@shared/scryfall'
import { useSearchStore } from '@renderer/state/searchStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useDeckStore } from '@renderer/state/deckStore'

export function CardDetail(): React.JSX.Element | null {
  const detailCardId = usePrintingStore((state) => state.detailCardId)
  const override = usePrintingStore((state) =>
    detailCardId ? state.overrides[detailCardId] : undefined
  )
  const close = usePrintingStore((state) => state.close)
  const choose = usePrintingStore((state) => state.choose)
  const addToDeck = useDeckStore((state) => state.add)
  const original = useSearchStore((state) =>
    detailCardId ? state.cards.find((card) => card.id === detailCardId) : undefined
  )
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const scale = useUpscaleStore((state) => state.scale)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)
  const markUpscaled = useUpscaleStore((state) => state.markUpscaled)

  const [printings, setPrintings] = useState<Card[]>([])
  const [loadingPrintings, setLoadingPrintings] = useState(false)
  const [faceIndex, setFaceIndex] = useState(0)
  const [compare, setCompare] = useState(50)

  const displayed = override ?? original
  const oracleId = displayed?.oracleId ?? null

  // Close on Escape.
  useEffect(() => {
    if (!detailCardId) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailCardId, close])

  // Reset the viewed face when switching to a different card.
  useEffect(() => setFaceIndex(0), [detailCardId])

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

  if (!detailCardId || !displayed) return null

  const face = displayed.faces[faceIndex] ?? displayed.faces[0]
  const isDoubleFaced = displayed.faces.length > 1
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
            <div className="compare">
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
              <input
                className="compare__range"
                type="range"
                min={0}
                max={100}
                value={compare}
                onChange={(event) => setCompare(Number(event.target.value))}
                aria-label="Drag to compare original and upscaled"
              />
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
            </p>
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
                <button className="toggle" type="button" onClick={() => markUpscaled(displayed.id)}>
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
                      onClick={() => choose(detailCardId, printing)}
                      title={`${printing.setCode.toUpperCase()} · #${printing.collectorNumber}`}
                    >
                      <img
                        className="prints__thumb"
                        src={faceImageUrl(printing.id, 0, 'source')}
                        alt={`${printing.name} (${printing.setCode.toUpperCase()})`}
                        loading="lazy"
                        draggable={false}
                      />
                      <span className="prints__label">{printing.setCode.toUpperCase()}</span>
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
