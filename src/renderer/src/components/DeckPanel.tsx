import { useState } from 'react'
import { bestUsd, faceImageUrl, formatUsd } from '@shared/scryfall'
import { useDeckStore, type DeckItem } from '@renderer/state/deckStore'
import { faceKey, useUpscaleStore } from '@renderer/state/upscaleStore'
import { ImportDialog } from '@renderer/components/ImportDialog'
import { ExportDialog } from '@renderer/components/ExportDialog'

function DeckItemRow({ item }: { item: DeckItem }): React.JSX.Element {
  const setQuantity = useDeckStore((state) => state.setQuantity)
  const remove = useDeckStore((state) => state.remove)
  const status = useUpscaleStore((state) => state.statuses[faceKey(item.card.id, 0)])

  return (
    <li className="ditem">
      <img
        className="ditem__thumb"
        src={faceImageUrl(item.card.id, 0, 'source')}
        alt={item.card.name}
        loading="lazy"
        draggable={false}
      />
      <div className="ditem__info">
        <span className="ditem__name">{item.card.name}</span>
        <span className="ditem__meta">
          {item.card.setCode.toUpperCase()} · {formatUsd(bestUsd(item.card.prices))}
          {status === 'ready' ? ' · 4×' : status === 'upscaling' ? ' · …' : ''}
        </span>
      </div>
      <div className="ditem__qty">
        <button
          type="button"
          onClick={() => setQuantity(item.card.id, item.quantity - 1)}
          aria-label={`Decrease ${item.card.name}`}
        >
          −
        </button>
        <span className="ditem__count">{item.quantity}</span>
        <button
          type="button"
          onClick={() => setQuantity(item.card.id, item.quantity + 1)}
          aria-label={`Increase ${item.card.name}`}
        >
          +
        </button>
      </div>
      <button
        className="ditem__remove"
        type="button"
        onClick={() => remove(item.card.id)}
        aria-label={`Remove ${item.card.name}`}
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
  const [showImport, setShowImport] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const total = items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice = items.reduce(
    (sum, item) => sum + (bestUsd(item.card.prices) ?? 0) * item.quantity,
    0
  )

  // Warm the upscale pipeline for every deck face so they're ready for export.
  const preUpscale = (): void => {
    for (const item of items) {
      item.card.faces.forEach((_face, index) => {
        const image = new Image()
        image.src = faceImageUrl(item.card.id, index, 'upscaled')
      })
    }
  }

  return (
    <section className="deck">
      <div className="deck__head">
        <h2 className="deck__title">
          Deck <span className="deck__count">{total}</span>
        </h2>
        <div className="deck__actions">
          <button className="toggle" type="button" onClick={() => setShowImport(true)}>
            Import
          </button>
          <button className="toggle" type="button" onClick={() => void loadDeck()}>
            Load
          </button>
          <button className="toggle" type="button" onClick={() => void addCustomCard()}>
            + Custom
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
      </div>

      {items.length > 0 && (
        <p className="deck__total" title="Estimated market price from Scryfall, updated daily">
          Est. value <strong>{formatUsd(totalPrice)}</strong>
        </p>
      )}

      {items.length > 0 && (
        <button className="deck__export" type="button" onClick={() => setShowExport(true)}>
          Export PDF
        </button>
      )}

      {upscalerAvailable && items.length > 0 && (
        <button className="deck__prewarm" type="button" onClick={preUpscale}>
          Pre-upscale all
        </button>
      )}

      {items.length === 0 ? (
        <p className="deck__empty">No cards yet. Add from search, or import a list.</p>
      ) : (
        <ul className="deck__list">
          {items.map((item) => (
            <DeckItemRow key={item.card.id} item={item} />
          ))}
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
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </section>
  )
}
