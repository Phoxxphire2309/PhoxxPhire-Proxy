import { useState } from 'react'
import { bestUsd, faceImageUrl, formatUsd } from '@shared/scryfall'
import { useDeckStore, type DeckItem } from '@renderer/state/deckStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { faceKey, useUpscaleStore } from '@renderer/state/upscaleStore'
import { ImportDialog } from '@renderer/components/ImportDialog'
import { TokenDialog } from '@renderer/components/TokenDialog'
import { DeckStats } from '@renderer/components/DeckStats'
import { ExportDialog } from '@renderer/components/ExportDialog'
import { PrintPreview } from '@renderer/components/PrintPreview'
import { PageSetup } from '@renderer/components/PageSetup'

function facesOf(item: DeckItem): number {
  return Math.max(1, item.card.faces.length)
}

function DeckFaceRow({
  item,
  faceIndex
}: {
  item: DeckItem
  faceIndex: number
}): React.JSX.Element {
  const setFaceQuantity = useDeckStore((state) => state.setFaceQuantity)
  const remove = useDeckStore((state) => state.remove)
  const openDeck = usePrintingStore((state) => state.openDeck)
  const status = useUpscaleStore((state) => state.statuses[faceKey(item.card.id, faceIndex)])

  const multiFace = item.card.faces.length > 1
  const faceName = multiFace ? (item.card.faces[faceIndex]?.name ?? item.card.name) : item.card.name
  const quantity = item.quantities[faceIndex] ?? 0

  const open = (): void => openDeck(item.card)

  return (
    <li className="ditem">
      <div
        className="ditem__open"
        role="button"
        tabIndex={0}
        aria-label={`Change version or upscale ${faceName}`}
        onClick={open}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            open()
          }
        }}
      >
        <img
          className="ditem__thumb"
          src={faceImageUrl(item.card.id, faceIndex, 'source')}
          alt={faceName}
          loading="lazy"
          draggable={false}
        />
        <div className="ditem__info">
          <span className="ditem__name">{faceName}</span>
          <span className="ditem__meta">
            {item.card.setCode.toUpperCase()} · {formatUsd(bestUsd(item.card.prices))}
            {status === 'ready' ? ' · 4×' : status === 'upscaling' ? ' · …' : ''}
          </span>
        </div>
      </div>
      <div className="ditem__qty">
        <button
          type="button"
          onClick={() => setFaceQuantity(item.card.id, faceIndex, quantity - 1)}
          aria-label={`Decrease ${faceName}`}
        >
          −
        </button>
        <span className="ditem__count">{quantity}</span>
        <button
          type="button"
          onClick={() => setFaceQuantity(item.card.id, faceIndex, quantity + 1)}
          aria-label={`Increase ${faceName}`}
        >
          +
        </button>
      </div>
      <button
        className="ditem__remove"
        type="button"
        onClick={() => remove(item.card.id)}
        aria-label={`Remove ${faceName}`}
        title="Remove card"
      >
        ✕
      </button>
    </li>
  )
}

export function DeckPanel(): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const clear = useDeckStore((state) => state.clear)
  const saveDeck = useDeckStore((state) => state.saveDeck)
  const loadDeck = useDeckStore((state) => state.loadDeck)
  const addCustomCard = useDeckStore((state) => state.addCustomCard)
  const importErrors = useDeckStore((state) => state.importErrors)
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  const runUpscale = useUpscaleStore((state) => state.runUpscale)
  const bulkSwitchPrintings = useDeckStore((state) => state.bulkSwitchPrintings)
  const bulkRunning = useDeckStore((state) => state.bulkRunning)
  const [showImport, setShowImport] = useState(false)
  const [showTokens, setShowTokens] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showPageSetup, setShowPageSetup] = useState(false)

  const total = items.reduce((sum, item) => sum + item.quantities.reduce((a, b) => a + b, 0), 0)
  const totalPrice = items.reduce(
    (sum, item) => sum + (bestUsd(item.card.prices) ?? 0) * Math.max(...item.quantities),
    0
  )

  // Mark every deck card upscaled (so preview/export use it) and warm the cache.
  const preUpscale = (): void =>
    runUpscale(
      items.flatMap((item) =>
        item.card.faces.map((_f, i) => ({ cardId: item.card.id, faceIndex: i }))
      )
    )

  return (
    <section className="deck">
      <div className="deck__head">
        <h2 className="deck__title">
          Deck <span className="deck__count">{total}</span>
        </h2>
        {items.length > 0 && (
          <span className="deck__total" title="Estimated market price from Scryfall, updated daily">
            {formatUsd(totalPrice)}
          </span>
        )}
      </div>

      <div className="deck__toolbar">
        <button className="toggle" type="button" onClick={() => setShowImport(true)}>
          Import
        </button>
        <button className="toggle" type="button" onClick={() => void loadDeck()}>
          Load
        </button>
        <button className="toggle" type="button" onClick={() => void addCustomCard()}>
          Custom
        </button>
        {items.length > 0 && (
          <button className="toggle" type="button" onClick={() => void saveDeck()}>
            Save
          </button>
        )}
        {items.length > 0 && (
          <button className="toggle" type="button" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="deck__primary">
          <button className="deck__preview" type="button" onClick={() => setShowPageSetup(true)}>
            Page setup
          </button>
          <button className="deck__preview" type="button" onClick={() => setShowPreview(true)}>
            Print preview
          </button>
          <button className="deck__preview" type="button" onClick={() => setShowTokens(true)}>
            Tokens
          </button>
          <button
            className="deck__preview"
            type="button"
            onClick={() => setShowStats((value) => !value)}
            aria-pressed={showStats}
          >
            {showStats ? 'Hide stats' : 'Stats'}
          </button>
          <button className="deck__export" type="button" onClick={() => setShowExport(true)}>
            Export PDF
          </button>
          {upscalerAvailable && (
            <button className="deck__prewarm" type="button" onClick={preUpscale}>
              Pre-upscale all
            </button>
          )}
          <button
            className="deck__preview"
            type="button"
            disabled={bulkRunning}
            onClick={() => void bulkSwitchPrintings('highres')}
            title="Switch every card to its highest-resolution printing"
          >
            {bulkRunning ? 'Switching…' : 'All → best scan'}
          </button>
          <button
            className="deck__preview"
            type="button"
            disabled={bulkRunning}
            onClick={() => void bulkSwitchPrintings('cheapest')}
            title="Switch every card to its cheapest printing"
          >
            All → cheapest
          </button>
        </div>
      )}

      {items.length > 0 && showStats && <DeckStats />}

      {items.length === 0 ? (
        <p className="deck__empty">No cards yet. Add from search, or import a list.</p>
      ) : (
        <ul className="deck__list">
          {items.flatMap((item) =>
            Array.from({ length: facesOf(item) }, (_unused, faceIndex) => (
              <DeckFaceRow key={`${item.card.id}:${faceIndex}`} item={item} faceIndex={faceIndex} />
            ))
          )}
        </ul>
      )}

      {importErrors.length > 0 && (
        <div className="deck__errors">
          <p className="deck__errors-head">{importErrors.length} line(s) couldn’t be resolved:</p>
          <ul>
            {importErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      {showImport && <ImportDialog onClose={() => setShowImport(false)} />}
      {showTokens && <TokenDialog onClose={() => setShowTokens(false)} />}
      {showExport && (
        <ExportDialog
          onClose={() => setShowExport(false)}
          onEditPageSetup={() => {
            setShowExport(false)
            setShowPageSetup(true)
          }}
        />
      )}
      {showPreview && <PrintPreview onClose={() => setShowPreview(false)} />}
      {showPageSetup && <PageSetup onClose={() => setShowPageSetup(false)} />}
    </section>
  )
}
