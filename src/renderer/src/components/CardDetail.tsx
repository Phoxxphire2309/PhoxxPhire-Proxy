import { useEffect, useRef, useState } from 'react'
import {
  bestPrinting,
  bestUsd,
  faceImageUrl,
  formatUsd,
  isHighRes,
  type Card
} from '@shared/scryfall'
import {
  mpcfillCardType,
  mpcfillFaceKey,
  mpcfillImageUrl,
  type MpcfillImage
} from '@shared/mpcfill'
import { printingHidden } from '@shared/printingFilters'
import { usePrintingStore } from '@renderer/state/printingStore'
import { usePrintingFiltersStore } from '@renderer/state/printingFiltersStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { upscaleCardWithConfirm } from '@renderer/state/upscaleActions'
import { useTextProxyStore } from '@renderer/state/textProxyStore'
import { useImageSourceStore, useMpcfillSelection } from '@renderer/state/imageSourceStore'
import { ManaCost } from '@renderer/components/ManaCost'
import { useDeckStore } from '@renderer/state/deckStore'
import { toast } from '@renderer/state/toastStore'

type ArtSource = 'scryfall' | 'mpcfill'

export function CardDetail({
  variant = 'modal'
}: {
  variant?: 'modal' | 'panel'
}): React.JSX.Element | null {
  const detailCard = usePrintingStore((state) => state.detailCard)
  const close = usePrintingStore((state) => state.close)
  const choose = usePrintingStore((state) => state.choose)
  const addToDeck = useDeckStore((state) => state.add)
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  const settingsVersion = useUpscaleStore((state) => state.settingsVersion)
  const scale = useUpscaleStore((state) => state.scale)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)
  const proxies = useTextProxyStore((state) => state.proxies)
  const toggleProxy = useTextProxyStore((state) => state.toggle)
  const selectMpcfill = useImageSourceStore((state) => state.selectMpcfill)
  const clearMpcfill = useImageSourceStore((state) => state.clearMpcfill)

  const [printings, setPrintings] = useState<Card[]>([])
  const [loadingPrintings, setLoadingPrintings] = useState(false)
  const [faceIndex, setFaceIndex] = useState(0)
  const [artSource, setArtSource] = useState<ArtSource>('scryfall')
  const [mpcfillResults, setMpcfillResults] = useState<MpcfillImage[]>([])
  const [mpcfillState, setMpcfillState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [compare, setCompare] = useState(50)
  const [dragging, setDragging] = useState(false)
  const [setFilter, setSetFilter] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const activeFilters = usePrintingFiltersStore((state) => state.active)
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
  const mpcfillSelection = useMpcfillSelection(displayed?.id ?? '', faceIndex)

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

  // Open the art tab on whichever source the face is currently using.
  useEffect(() => {
    if (!detailCard) return
    const has = Boolean(
      useImageSourceStore.getState().selections[mpcfillFaceKey(detailCard.id, faceIndex)]
    )
    setArtSource(has ? 'mpcfill' : 'scryfall')
  }, [detailCard?.id, faceIndex, detailCard])

  // Lazily search MPCFill for the face's name when the MPCFill tab is shown.
  useEffect(() => {
    if (!detailCard || artSource !== 'mpcfill') return
    const query = detailCard.faces[faceIndex]?.name ?? detailCard.name
    let cancelled = false
    setMpcfillState('loading')
    setMpcfillResults([])
    window.phoxx
      .searchMpcfill(query, mpcfillCardType(detailCard))
      .then((results) => {
        if (cancelled) return
        setMpcfillResults(results)
        setMpcfillState('idle')
      })
      .catch(() => !cancelled && setMpcfillState('error'))
    return () => {
      cancelled = true
    }
  }, [detailCard?.id, faceIndex, artSource, detailCard])

  // Load all printings for the displayed card's oracle id.
  useEffect(() => {
    setSetFilter('') // a new card has a different set list
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
  // Scryfall returns printings oldest→newest; show them newest-first for browsing.
  const printingsNewestFirst = [...printings].reverse()
  // Distinct sets across all printings, for the set filter dropdown.
  const setCodes = [...new Set(printings.map((printing) => printing.setCode))].sort()
  const setMatched = setFilter
    ? printingsNewestFirst.filter((printing) => printing.setCode === setFilter)
    : printingsNewestFirst
  // Apply the printing filters, but always keep the currently chosen printing
  // visible so the selection never disappears. A toggle reveals the hidden ones.
  const filterKeys = Object.keys(activeFilters)
  const hiddenCount = filterKeys.length
    ? setMatched.filter(
        (printing) => printing.id !== displayed.id && printingHidden(printing, filterKeys)
      ).length
    : 0
  const visiblePrintings =
    filterKeys.length && !showHidden
      ? setMatched.filter(
          (printing) => printing.id === displayed.id || !printingHidden(printing, filterKeys)
        )
      : setMatched
  const betterAvailable =
    best !== null && best.id !== displayed.id && isHighRes(best) && !isHighRes(displayed)
  const upscaled = Boolean(upscaledSet[displayed.id])
  const isProxy = Boolean(proxies[displayed.id])
  const showCompare = upscalerAvailable && upscaled && !isProxy
  const sourceSrc = faceImageUrl(displayed.id, faceIndex, 'source')
  const thumbSrc = isProxy
    ? faceImageUrl(displayed.id, faceIndex, 'proxy')
    : faceImageUrl(displayed.id, faceIndex, 'thumb')
  const upscaledSrc = faceImageUrl(displayed.id, faceIndex, 'upscaled', settingsVersion)
  // A face using MPCFill art previews that Drive image (the Scryfall upscale
  // compare slider doesn't apply to it).
  const previewSrc = mpcfillSelection
    ? mpcfillImageUrl(mpcfillSelection.identifier, 'source')
    : thumbSrc
  const showCompareFinal = showCompare && !mpcfillSelection

  // Choosing from either tab sets the card's per-card source: a Scryfall
  // printing clears any MPCFill pick; an MPCFill image overrides the scan.
  const chooseScryfall = (printing: Card): void => {
    clearMpcfill(displayed.id, faceIndex)
    choose(printing)
  }
  const chooseMpcfill = (image: MpcfillImage): void => {
    selectMpcfill(displayed.id, faceIndex, {
      identifier: image.identifier,
      name: image.name,
      source: image.source
    })
    toast(`Using MPCFill art by ${image.source}`, 'success')
  }

  const panel = (
    <div className="detail__panel">
      <button className="detail__close" type="button" onClick={close} aria-label="Close">
        ✕
      </button>

      <div className="detail__main">
        {showCompareFinal ? (
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
            src={previewSrc}
            alt={face?.name ?? displayed.name}
            draggable={false}
          />
        )}

        <div className="detail__info">
          <div className="detail__namerow">
            <h2 className="detail__name">{face?.name ?? displayed.name}</h2>
            {face?.manaCost && <ManaCost cost={face.manaCost} />}
          </div>
          <p className="detail__meta">
            {displayed.setCode.toUpperCase()} · #{displayed.collectorNumber} · {displayed.layout}
            {displayed.imageStatus !== undefined && (
              <span className={`quality ${isHighRes(displayed) ? 'quality--hd' : 'quality--low'}`}>
                {isHighRes(displayed) ? 'HD scan' : 'Low-res scan'}
              </span>
            )}
          </p>
          {betterAvailable && best && (
            <button
              className="detail__suggest"
              type="button"
              onClick={() => chooseScryfall(best)}
              title="Switch to a higher-resolution printing for a sharper upscale"
            >
              <span className="detail__suggest-icon" aria-hidden="true">
                ✦
              </span>
              <span className="detail__suggest-text">
                Use best-quality printing
                <span className="detail__suggest-set">{best.setCode.toUpperCase()}</span>
              </span>
            </button>
          )}
          <p className="detail__price" title="Estimated market price from Scryfall, updated daily">
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
            <button
              className={`toggle${isProxy ? ' is-on' : ''}`}
              type="button"
              onClick={() => toggleProxy(displayed.id)}
              title="Print a clean text-only proxy from the card's rules text instead of the scan"
            >
              {isProxy ? '✓ Text proxy' : 'Text proxy'}
            </button>
          </div>

          <div className="detail__subrow">
            <div className="segmented" role="group" aria-label="Card art source">
              <button
                type="button"
                className={artSource === 'scryfall' ? 'is-on' : ''}
                onClick={() => setArtSource('scryfall')}
                aria-pressed={artSource === 'scryfall'}
              >
                Scryfall
              </button>
              <button
                type="button"
                className={artSource === 'mpcfill' ? 'is-on' : ''}
                onClick={() => setArtSource('mpcfill')}
                aria-pressed={artSource === 'mpcfill'}
              >
                MPCFill
              </button>
            </div>
            {artSource === 'scryfall' && setCodes.length > 1 && (
              <select
                className="prints__setfilter"
                value={setFilter}
                onChange={(event) => setSetFilter(event.target.value)}
                aria-label="Filter printings by set"
              >
                <option value="">All sets ({printings.length})</option>
                {setCodes.map((code) => (
                  <option key={code} value={code}>
                    {code.toUpperCase()}
                  </option>
                ))}
              </select>
            )}
          </div>

          {artSource === 'scryfall' ? (
            <>
              <h3 className="detail__sub">
                Printings{printings.length ? ` (${visiblePrintings.length})` : ''}
              </h3>
              {loadingPrintings ? (
                <p className="detail__hint">Loading printings…</p>
              ) : printings.length <= 1 ? (
                <p className="detail__hint">No other printings found.</p>
              ) : visiblePrintings.length === 0 ? (
                <p className="detail__hint">No printings in {setFilter.toUpperCase()}.</p>
              ) : (
                <ul className="prints">
                  {visiblePrintings.map((printing) => (
                    <li key={printing.id}>
                      <button
                        type="button"
                        className={`prints__item${
                          printing.id === displayed.id && !mpcfillSelection ? ' is-active' : ''
                        }`}
                        onClick={() => chooseScryfall(printing)}
                        title={`${printing.setCode.toUpperCase()} · #${printing.collectorNumber}`}
                      >
                        <img
                          className="prints__thumb"
                          src={faceImageUrl(printing.id, 0, 'thumb')}
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
              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="prints__showhidden"
                  onClick={() => setShowHidden((value) => !value)}
                >
                  {showHidden
                    ? 'Hide filtered printings'
                    : `Show ${hiddenCount} filtered printing${hiddenCount === 1 ? '' : 's'}`}
                </button>
              )}
            </>
          ) : (
            <>
              <h3 className="detail__sub">
                MPCFill art{mpcfillResults.length ? ` (${mpcfillResults.length})` : ''}
              </h3>
              {mpcfillState === 'loading' ? (
                <p className="detail__hint">Searching MPCFill…</p>
              ) : mpcfillState === 'error' ? (
                <p className="detail__hint">
                  Couldn’t reach MPCFill — check your connection and try again.
                </p>
              ) : mpcfillResults.length === 0 ? (
                <p className="detail__hint">
                  No MPCFill art found for this card. It’ll use the Scryfall scan.
                </p>
              ) : (
                <ul className="prints">
                  {mpcfillResults.map((image) => (
                    <li key={image.identifier}>
                      <button
                        type="button"
                        className={`prints__item${
                          mpcfillSelection?.identifier === image.identifier ? ' is-active' : ''
                        }`}
                        onClick={() => chooseMpcfill(image)}
                        title={`${image.name} · ${image.source}`}
                      >
                        <img
                          className="prints__thumb"
                          src={mpcfillImageUrl(image.identifier, 'thumb')}
                          alt={`${image.name} by ${image.source}`}
                          loading="lazy"
                          draggable={false}
                        />
                        <span className="prints__label">{image.source}</span>
                        <span className="prints__price">{image.dpi}dpi</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {mpcfillSelection && (
                <button
                  type="button"
                  className="prints__showhidden"
                  onClick={() => {
                    clearMpcfill(displayed.id, faceIndex)
                    setArtSource('scryfall')
                    toast('Using the Scryfall scan', 'success')
                  }}
                >
                  Use Scryfall scan instead
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )

  if (variant === 'panel') {
    return (
      <div className="detail--inline" aria-label={`${displayed.name} details`}>
        {panel}
      </div>
    )
  }

  return (
    <div
      className="detail"
      role="dialog"
      aria-modal="true"
      aria-label={`${displayed.name} details`}
    >
      {/* A real button as the backdrop keeps click-to-dismiss accessible (Escape also closes). */}
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={close} />
      {panel}
    </div>
  )
}
