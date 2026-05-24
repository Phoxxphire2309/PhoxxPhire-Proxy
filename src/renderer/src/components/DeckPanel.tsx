import { useEffect, useState } from 'react'
import { bestUsd, faceImageUrl, formatUsd } from '@shared/scryfall'
import {
  DECK_SECTIONS,
  DECK_SECTION_LABELS,
  isPrintableSection,
  type DeckSection
} from '@shared/deck'
import type { DecklistFormat } from '@shared/decklistExport'
import { useDeckStore, type BulkPrintingMode, type DeckItem } from '@renderer/state/deckStore'
import { useCollectionStore } from '@renderer/state/collectionStore'
import { useRotateStore } from '@renderer/state/rotateStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { faceKey, useUpscaleStore } from '@renderer/state/upscaleStore'
import { preUpscaleDeckWithConfirm } from '@renderer/state/upscaleActions'
import { ImportDialog } from '@renderer/components/ImportDialog'
import { TokenDialog } from '@renderer/components/TokenDialog'
import { BasicLandDialog } from '@renderer/components/BasicLandDialog'
import { CollectionDialog } from '@renderer/components/CollectionDialog'
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
  const setSection = useDeckStore((state) => state.setSection)
  const remove = useDeckStore((state) => state.remove)
  const openDeck = usePrintingStore((state) => state.openDeck)
  const status = useUpscaleStore((state) => state.statuses[faceKey(item.card.id, faceIndex)])
  const owned = useCollectionStore(
    (state) => state.owned[item.card.name.trim().toLowerCase()] === true
  )
  const skipOwned = useCollectionStore((state) => state.skipOwned)
  const forced = useCollectionStore((state) => state.forcePrint[item.card.id] === true)
  const toggleForce = useCollectionStore((state) => state.toggleForce)
  const rotated = useRotateStore((state) => state.rotated[item.card.id] === true)
  const toggleRotate = useRotateStore((state) => state.toggle)

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
            {owned && <span className="ditem__owned">owned</span>}
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
      {faceIndex === 0 && (
        <select
          className="ditem__section"
          value={item.section}
          onChange={(event) => setSection(item.card.id, event.target.value as DeckSection)}
          aria-label={`Section for ${item.card.name}`}
          title="Move to section"
        >
          {DECK_SECTIONS.map((section) => (
            <option key={section} value={section}>
              {DECK_SECTION_LABELS[section]}
            </option>
          ))}
        </select>
      )}
      {faceIndex === 0 && (
        <button
          type="button"
          className={`ditem__rotate${rotated ? ' is-on' : ''}`}
          onClick={() => toggleRotate(item.card.id)}
          aria-pressed={rotated}
          aria-label={`Rotate ${item.card.name} 180°`}
          title="Rotate 180° when printed"
        >
          ⟳
        </button>
      )}
      {faceIndex === 0 && owned && skipOwned && (
        <button
          type="button"
          className={`ditem__force${forced ? ' is-on' : ''}`}
          onClick={() => toggleForce(item.card.id)}
          title={
            forced
              ? 'Printing this owned card anyway — click to skip it'
              : 'Owned: skipped on export — click to print anyway'
          }
        >
          {forced ? 'printing' : 'skipped'}
        </button>
      )}
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
  const saveProject = useDeckStore((state) => state.saveProject)
  const loadProject = useDeckStore((state) => state.loadProject)
  const addCustomCard = useDeckStore((state) => state.addCustomCard)
  const importErrors = useDeckStore((state) => state.importErrors)
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  const bulkSwitchPrintings = useDeckStore((state) => state.bulkSwitchPrintings)
  const exportDecklist = useDeckStore((state) => state.exportDecklist)
  const bulkRunning = useDeckStore((state) => state.bulkRunning)
  const undo = useDeckStore((state) => state.undo)
  const redo = useDeckStore((state) => state.redo)
  const canUndo = useDeckStore((state) => state.past.length > 0)
  const canRedo = useDeckStore((state) => state.future.length > 0)
  const [showImport, setShowImport] = useState(false)
  const [showTokens, setShowTokens] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showLands, setShowLands] = useState(false)
  const [showCollection, setShowCollection] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showPageSetup, setShowPageSetup] = useState(false)

  const total = items.reduce((sum, item) => sum + item.quantities.reduce((a, b) => a + b, 0), 0)
  const totalPrice = items.reduce(
    (sum, item) => sum + (bestUsd(item.card.prices) ?? 0) * Math.max(...item.quantities),
    0
  )

  // Cmd/Ctrl+Z to undo, Shift to redo.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const usedSections = DECK_SECTIONS.filter((section) =>
    items.some((item) => item.section === section)
  )
  const renderRows = (list: DeckItem[]): React.JSX.Element[] =>
    list.flatMap((item) =>
      Array.from({ length: facesOf(item) }, (_unused, faceIndex) => (
        <DeckFaceRow key={`${item.card.id}:${faceIndex}`} item={item} faceIndex={faceIndex} />
      ))
    )

  // Mark deck cards upscaled (so preview/export use them) and warm the cache,
  // asking whether to do every card or only those that aren't already high-res.
  const preUpscale = (): void => void preUpscaleDeckWithConfirm(items.map((item) => item.card))

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
        <button
          className="toggle"
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Cmd/Ctrl+Z)"
        >
          ↶
        </button>
        <button
          className="toggle"
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Shift+Cmd/Ctrl+Z)"
        >
          ↷
        </button>
        <button className="toggle" type="button" onClick={() => setShowImport(true)}>
          Import
        </button>
        <button className="toggle" type="button" onClick={() => void loadDeck()}>
          Load
        </button>
        <button className="toggle" type="button" onClick={() => void loadProject()}>
          Open project
        </button>
        <button className="toggle" type="button" onClick={() => void addCustomCard()}>
          Custom
        </button>
        <button className="toggle" type="button" onClick={() => setShowLands(true)}>
          Lands
        </button>
        <button className="toggle" type="button" onClick={() => setShowCollection(true)}>
          Collection
        </button>
        {items.length > 0 && (
          <button className="toggle" type="button" onClick={() => void saveDeck()}>
            Save
          </button>
        )}
        {items.length > 0 && (
          <button className="toggle" type="button" onClick={() => void saveProject()}>
            Save project
          </button>
        )}
        {items.length > 0 && (
          <select
            className="deck__bulk"
            value=""
            onChange={(event) => {
              const format = event.target.value
              event.target.value = ''
              if (format) void exportDecklist(format as DecklistFormat)
            }}
            aria-label="Export decklist as a file"
            title="Export the decklist as text, MTG Arena, or CSV"
          >
            <option value="" disabled>
              Export list →
            </option>
            <option value="text">Text (.txt)</option>
            <option value="mtga">MTG Arena (.txt)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
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
          <select
            className="deck__bulk"
            disabled={bulkRunning}
            value=""
            onChange={(event) => {
              const mode = event.target.value
              event.target.value = ''
              if (mode) void bulkSwitchPrintings(mode as BulkPrintingMode)
            }}
            aria-label="Switch all cards to a printing"
            title="Switch every card to a chosen printing"
          >
            <option value="" disabled>
              {bulkRunning ? 'Switching…' : 'All cards →'}
            </option>
            <option value="highres">Best scan</option>
            <option value="cheapest">Cheapest</option>
            <option value="expensive">Most expensive</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      )}

      {items.length > 0 && showStats && <DeckStats />}

      {items.length === 0 ? (
        <p className="deck__empty">No cards yet. Add from search, or import a list.</p>
      ) : usedSections.length > 1 ? (
        usedSections.map((section) => {
          const sectionItems = items.filter((item) => item.section === section)
          const count = sectionItems.reduce((sum, item) => sum + (item.quantities[0] ?? 0), 0)
          return (
            <div className="deck__group" key={section}>
              <h3 className="deck__section">
                {DECK_SECTION_LABELS[section]} <span className="deck__count">{count}</span>
                {!isPrintableSection(section) && <span className="deck__noprint">not printed</span>}
              </h3>
              <ul className="deck__list">{renderRows(sectionItems)}</ul>
            </div>
          )
        })
      ) : (
        <ul className="deck__list">{renderRows(items)}</ul>
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
      {showLands && <BasicLandDialog onClose={() => setShowLands(false)} />}
      {showCollection && <CollectionDialog onClose={() => setShowCollection(false)} />}
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
