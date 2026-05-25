import { bestUsd, faceImageUrl, formatUsd, type Card } from '@shared/scryfall'
import { SORT_OPTIONS, type SearchFilters, type SortKey } from '@shared/scryfallQuery'
import { PAGE_SIZE, useSearchStore } from '@renderer/state/searchStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { useDeckStore } from '@renderer/state/deckStore'
import { CardTile } from '@renderer/components/CardTile'

const COLOR_NAMES: Record<string, string> = {
  w: 'White',
  u: 'Blue',
  b: 'Black',
  r: 'Red',
  g: 'Green',
  c: 'Colourless'
}

/** Active filters as removable chips (each clears its field and re-searches). */
function activeChips(
  filters: SearchFilters,
  setFilters: (patch: Partial<SearchFilters>) => void,
  rerun: () => void
): { id: string; label: string; onRemove: () => void }[] {
  const chips: { id: string; label: string; onRemove: () => void }[] = []
  const apply = (patch: Partial<SearchFilters>): void => {
    setFilters(patch)
    rerun()
  }
  for (const code of filters.colors) {
    chips.push({
      id: `c-${code}`,
      label: COLOR_NAMES[code] ?? code.toUpperCase(),
      onRemove: () => apply({ colors: filters.colors.filter((value) => value !== code) })
    })
  }
  const text: [keyof SearchFilters, string][] = [
    ['type', 'Type'],
    ['subtype', 'Subtype'],
    ['rarity', 'Rarity'],
    ['format', 'Format'],
    ['set', 'Set'],
    ['artist', 'Artist'],
    ['language', 'Lang']
  ]
  for (const [key, label] of text) {
    const value = filters[key]
    if (typeof value === 'string' && value.trim()) {
      chips.push({ id: key, label: `${label}: ${value}`, onRemove: () => apply({ [key]: '' }) })
    }
  }
  if (filters.manaMin.trim() || filters.manaMax.trim()) {
    chips.push({
      id: 'mv',
      label: `MV ${filters.manaMin || '0'}–${filters.manaMax || '∞'}`,
      onRemove: () => apply({ manaMin: '', manaMax: '' })
    })
  }
  return chips
}

function GridItem({ card }: { card: Card }): React.JSX.Element {
  const override = usePrintingStore((state) => state.overrides[card.id])
  const openGrid = usePrintingStore((state) => state.openGrid)
  const add = useDeckStore((state) => state.add)
  const displayed = override ?? card
  return (
    <CardTile
      card={displayed}
      onOpen={() => openGrid(card.id, displayed)}
      onAdd={() => add(displayed)}
    />
  )
}

/** A compact list row used in list view. */
function ListRow({ card }: { card: Card }): React.JSX.Element {
  const override = usePrintingStore((state) => state.overrides[card.id])
  const openGrid = usePrintingStore((state) => state.openGrid)
  const add = useDeckStore((state) => state.add)
  const displayed = override ?? card
  return (
    <li className="rlist__row">
      <button className="rlist__main" type="button" onClick={() => openGrid(card.id, displayed)}>
        <img
          className="rlist__thumb"
          src={faceImageUrl(displayed.id, 0, 'source')}
          alt=""
          loading="lazy"
          draggable={false}
        />
        <span className="rlist__name">{displayed.name}</span>
        <span className="rlist__meta">
          {displayed.setCode.toUpperCase()} · {displayed.typeLine ?? ''}
        </span>
        <span className="rlist__price">{formatUsd(bestUsd(displayed.prices))}</span>
      </button>
      <button
        className="rlist__add"
        type="button"
        onClick={() => add(displayed)}
        aria-label={`Add ${displayed.name} to deck`}
      >
        ＋
      </button>
    </li>
  )
}

/** Page numbers with ellipses around the current page. */
function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_u, i) => i + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const out: (number | '…')[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

export function CardGrid(): React.JSX.Element {
  const status = useSearchStore((state) => state.status)
  const error = useSearchStore((state) => state.error)
  const cards = useSearchStore((state) => state.cards)
  const totalCards = useSearchStore((state) => state.totalCards)
  const query = useSearchStore((state) => state.query)
  const filters = useSearchStore((state) => state.filters)
  const setFilters = useSearchStore((state) => state.setFilters)
  const resetFilters = useSearchStore((state) => state.resetFilters)
  const sort = useSearchStore((state) => state.sort)
  const setSort = useSearchStore((state) => state.setSort)
  const viewMode = useSearchStore((state) => state.viewMode)
  const setViewMode = useSearchStore((state) => state.setViewMode)
  const page = useSearchStore((state) => state.page)
  const goToPage = useSearchStore((state) => state.goToPage)
  const search = useSearchStore((state) => state.search)

  const chips = activeChips(filters, setFilters, () => void search())
  const totalPages = Math.max(1, Math.ceil(totalCards / PAGE_SIZE))

  const trimmed = query.trim()
  const hasResults = cards.length > 0

  return (
    <>
      <div className="rhead">
        <div className="rhead__top">
          <div>
            <h1 className="grid__heading">
              <span className="grid__heading-n">{totalCards.toLocaleString()}</span>{' '}
              {totalCards === 1 ? 'result' : 'results'}
              {trimmed ? (
                <>
                  {' '}
                  for <span className="grid__heading-q">“{trimmed}”</span>
                </>
              ) : null}
            </h1>
            {hasResults && (
              <p className="grid__count">
                Page {page} of {totalPages.toLocaleString()} · {totalCards.toLocaleString()} card
                {totalCards === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <div className="rhead__tools">
            <label className="rhead__sort">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
                {SORT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="viewtoggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={viewMode === 'grid' ? 'is-on' : ''}
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                ▦
              </button>
              <button
                type="button"
                className={viewMode === 'list' ? 'is-on' : ''}
                onClick={() => setViewMode('list')}
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
              >
                ≣
              </button>
            </div>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="rhead__chips">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="chip"
                onClick={chip.onRemove}
                title="Remove filter"
              >
                {chip.label} <span aria-hidden="true">✕</span>
              </button>
            ))}
            <button
              type="button"
              className="chip chip--clear"
              onClick={() => {
                resetFilters()
                void search()
              }}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {status === 'error' ? (
        <p className="grid__message grid__message--error">{error}</p>
      ) : status === 'loading' ? (
        <ul className="grid" aria-label="Loading results" aria-busy="true">
          {Array.from({ length: 15 }).map((_unused, index) => (
            <li key={index} className="grid__item">
              <div className="skel" />
            </li>
          ))}
        </ul>
      ) : !hasResults ? (
        <div className="emptystate">
          <p className="emptystate__title">No cards to show</p>
          <p className="emptystate__hint">
            Search by name, or try syntax like <code>t:dragon</code>, <code>c:rg</code>, or{' '}
            <code>set:mh3</code>.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <ul className="grid">
          {cards.map((card) => (
            <li key={card.id} className="grid__item">
              <GridItem card={card} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="rlist">
          {cards.map((card) => (
            <ListRow key={card.id} card={card} />
          ))}
        </ul>
      )}

      {hasResults && totalPages > 1 && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            className="pager__btn"
            disabled={page <= 1}
            onClick={() => void goToPage(page - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          {pageList(page, totalPages).map((p, index) =>
            p === '…' ? (
              <span key={`gap-${index}`} className="pager__gap">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`pager__btn${p === page ? ' is-on' : ''}`}
                onClick={() => void goToPage(p)}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            className="pager__btn"
            disabled={page >= totalPages}
            onClick={() => void goToPage(page + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </nav>
      )}
    </>
  )
}
