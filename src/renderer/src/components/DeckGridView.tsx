import { bestUsd, faceImageUrl, formatUsd } from '@shared/scryfall'
import { DECK_SECTIONS, DECK_SECTION_LABELS, type DeckSection } from '@shared/deck'
import { GROUP_OPTIONS, groupDeckItems, type GroupBy } from '@shared/deckGroup'
import type { DecklistFormat } from '@shared/decklistExport'
import { useUiStore } from '@renderer/state/uiStore'
import { useTextProxyStore } from '@renderer/state/textProxyStore'
import { useDeckStore, type DeckItem } from '@renderer/state/deckStore'
import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { DeckTabs } from '@renderer/components/DeckTabs'

/** One deck card as an art tile with quantity, section, and remove controls. */
function DeckGridCard({ item }: { item: DeckItem }): React.JSX.Element {
  const setFaceQuantity = useDeckStore((state) => state.setFaceQuantity)
  const setSection = useDeckStore((state) => state.setSection)
  const remove = useDeckStore((state) => state.remove)
  const openDeck = usePrintingStore((state) => state.openDeck)
  const isProxy = useTextProxyStore((state) => Boolean(state.proxies[item.card.id]))

  const faceCount = Math.max(1, item.card.faces.length)
  const qty = item.quantities[0] ?? 0
  const setQty = (next: number): void => {
    for (let face = 0; face < faceCount; face += 1) setFaceQuantity(item.card.id, face, next)
  }

  return (
    <li className="dgrid__item">
      <button
        className="dgrid__art"
        type="button"
        onClick={() => openDeck(item.card)}
        aria-label={`Change version of ${item.card.name}`}
      >
        <img
          src={faceImageUrl(item.card.id, 0, isProxy ? 'proxy' : 'thumb')}
          alt={item.card.name}
          loading="lazy"
          draggable={false}
        />
        <button
          className="dgrid__remove"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            remove(item.card.id)
          }}
          aria-label={`Remove ${item.card.name}`}
          title="Remove"
        >
          ✕
        </button>
      </button>

      <div className="dgrid__bar">
        <div className="dgrid__qty">
          <button type="button" onClick={() => setQty(qty - 1)} aria-label="Decrease">
            −
          </button>
          <span>{qty}</span>
          <button type="button" onClick={() => setQty(qty + 1)} aria-label="Increase">
            +
          </button>
        </div>
        <select
          className="dgrid__section"
          value={item.section}
          onChange={(event) => setSection(item.card.id, event.target.value as DeckSection)}
          aria-label={`Section for ${item.card.name}`}
        >
          {DECK_SECTIONS.map((section) => (
            <option key={section} value={section}>
              {DECK_SECTION_LABELS[section]}
            </option>
          ))}
        </select>
      </div>
      <span className="dgrid__name" title={item.card.name}>
        {item.card.name}
      </span>
      <span className="dgrid__meta">
        {item.card.setCode.toUpperCase()} · {formatUsd(bestUsd(item.card.prices))}
      </span>
    </li>
  )
}

/** The Decks view's main panel: deck selector, file actions, and a card grid. */
export function DeckGridView(): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const clear = useDeckStore((state) => state.clear)
  const saveDeck = useDeckStore((state) => state.saveDeck)
  const loadDeck = useDeckStore((state) => state.loadDeck)
  const saveProject = useDeckStore((state) => state.saveProject)
  const loadProject = useDeckStore((state) => state.loadProject)
  const addCustomCard = useDeckStore((state) => state.addCustomCard)
  const exportDecklist = useDeckStore((state) => state.exportDecklist)
  const importErrors = useDeckStore((state) => state.importErrors)
  const undo = useDeckStore((state) => state.undo)
  const redo = useDeckStore((state) => state.redo)
  const canUndo = useDeckStore((state) => state.past.length > 0)
  const canRedo = useDeckStore((state) => state.future.length > 0)
  const open = useDeckUiStore((state) => state.open)
  const groupBy = useUiStore((state) => state.deckGroupBy)
  const setGroupBy = useUiStore((state) => state.setDeckGroupBy)

  const total = items.reduce((sum, item) => sum + item.quantities.reduce((a, b) => a + b, 0), 0)
  const totalPrice = items.reduce(
    (sum, item) => sum + (bestUsd(item.card.prices) ?? 0) * Math.max(...item.quantities, 0),
    0
  )

  return (
    <div className="dview">
      <div className="dview__head">
        <div>
          <p className="deck__eyebrow">Current deck</p>
          <DeckTabs />
        </div>
        <div className="dview__value">
          <span className="deck__value-label">Deck value</span>
          <span className="deck__total">{formatUsd(totalPrice)}</span>
        </div>
      </div>

      <div className="deck__actions">
        <button
          className="deck__chip"
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Cmd/Ctrl+Z)"
        >
          ↶
        </button>
        <button
          className="deck__chip"
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Shift+Cmd/Ctrl+Z)"
        >
          ↷
        </button>
        <button className="deck__chip" type="button" onClick={() => open('import')}>
          Import
        </button>
        <button className="deck__chip" type="button" onClick={() => void loadDeck()}>
          Load
        </button>
        <button className="deck__chip" type="button" onClick={() => void addCustomCard()}>
          Custom
        </button>
        <button className="deck__chip" type="button" onClick={() => void loadProject()}>
          Open
        </button>
        {items.length > 0 && (
          <button className="deck__chip" type="button" onClick={() => void saveDeck()}>
            Save
          </button>
        )}
        {items.length > 0 && (
          <button className="deck__chip" type="button" onClick={() => void saveProject()}>
            Save project
          </button>
        )}
        {items.length > 0 && (
          <select
            className="deck__chip deck__chip--select"
            value=""
            onChange={(event) => {
              const format = event.target.value
              event.target.value = ''
              if (format) void exportDecklist(format as DecklistFormat)
            }}
            aria-label="Export decklist as a file"
          >
            <option value="" disabled>
              Export list ↓
            </option>
            <option value="text">Text (.txt)</option>
            <option value="mtga">MTG Arena (.txt)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        )}
        {items.length > 0 && (
          <button className="deck__chip" type="button" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="emptystate">
          <p className="emptystate__title">This deck is empty</p>
          <p className="emptystate__hint">
            Add cards from <strong>Search</strong> (the ＋ on a card, or drag it onto{' '}
            <strong>Decks</strong>), or use <strong>Import</strong> to paste a list.
          </p>
        </div>
      ) : (
        <>
          <div className="dview__cardsbar">
            <p className="deck__eyebrow deck__eyebrow--cards">
              Cards <span className="deck__count">{total}</span>
            </p>
            <label className="dview__groupby">
              <span>Group by</span>
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              >
                {GROUP_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {groupDeckItems(items, groupBy).map((group) => (
            <div className="dgroup" key={group.key}>
              {group.label && (
                <h3 className="dgroup__head">
                  {group.label}{' '}
                  <span className="deck__count">
                    {group.items.reduce((sum, item) => sum + (item.quantities[0] ?? 0), 0)}
                  </span>
                </h3>
              )}
              <ul className="dgrid">
                {group.items.map((item) => (
                  <DeckGridCard key={item.card.id} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </>
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
    </div>
  )
}
