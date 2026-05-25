import { hasActiveFilters, LANGUAGES } from '@shared/scryfallQuery'
import { useSearchStore } from '@renderer/state/searchStore'
import { useDeckStore } from '@renderer/state/deckStore'
import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { useUiStore, type AppView } from '@renderer/state/uiStore'
import { PrintPartner } from '@renderer/components/PrintPartner'

const NAV: { view: AppView; label: string; icon: string }[] = [
  { view: 'search', label: 'Search', icon: '⌕' },
  { view: 'decks', label: 'Decks', icon: '▤' },
  { view: 'settings', label: 'Settings', icon: '⚙' }
]

const COLORS: { code: string; label: string; symbol: string; swatch: string; ink: string }[] = [
  { code: 'w', label: 'White', symbol: 'W', swatch: '#f7efd2', ink: '#5b5326' },
  { code: 'u', label: 'Blue', symbol: 'U', swatch: '#3b82f6', ink: '#0b2a5e' },
  { code: 'b', label: 'Black', symbol: 'B', swatch: '#4a4651', ink: '#0c0a10' },
  { code: 'r', label: 'Red', symbol: 'R', swatch: '#ef4444', ink: '#5e0f0f' },
  { code: 'g', label: 'Green', symbol: 'G', swatch: '#22a55b', ink: '#0c3a20' },
  { code: 'c', label: 'Colourless', symbol: 'C', swatch: '#c2c6cf', ink: '#3a3e47' }
]

const RARITIES = ['common', 'uncommon', 'rare', 'mythic']
const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'pauper', 'commander']

/** The fixed left sidebar: brand, the always-visible search filters, and a footer. */
export function Sidebar(): React.JSX.Element {
  const filters = useSearchStore((state) => state.filters)
  const setFilters = useSearchStore((state) => state.setFilters)
  const resetFilters = useSearchStore((state) => state.resetFilters)
  const view = useUiStore((state) => state.view)
  const setView = useUiStore((state) => state.setView)
  const deckCount = useDeckStore((state) =>
    state.items.reduce((sum, item) => sum + (item.quantities[0] ?? 0), 0)
  )
  const openModal = useDeckUiStore((state) => state.open)
  const active = hasActiveFilters(filters)

  const toggleColor = (code: string): void => {
    const colors = filters.colors.includes(code)
      ? filters.colors.filter((value) => value !== code)
      : [...filters.colors, code]
    setFilters({ colors })
  }

  return (
    <aside className="sidebar">
      <nav className="nav">
        {NAV.map((item) => (
          <button
            key={item.view}
            type="button"
            className={`nav__item${view === item.view ? ' is-active' : ''}`}
            onClick={() => setView(item.view)}
            aria-current={view === item.view ? 'page' : undefined}
          >
            <span className="nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="nav__label">{item.label}</span>
            {item.view === 'decks' && deckCount > 0 && (
              <span className="nav__badge">{deckCount}</span>
            )}
          </button>
        ))}
        <button className="nav__item" type="button" onClick={() => openModal('collection')}>
          <span className="nav__icon" aria-hidden="true">
            ▣
          </span>
          <span className="nav__label">Collection</span>
        </button>
      </nav>

      <div className="sidebar__scroll">
        {view === 'search' && (
          <>
            <div className="sidebar__sectionhead">
              <span>Filters</span>
              {active && (
                <button type="button" className="sidebar__clear" onClick={resetFilters}>
                  Clear all
                </button>
              )}
            </div>

            <div className="filt">
              <span className="filt__label">Colour</span>
              <div className="filt__colors">
                {COLORS.map((color) => {
                  const on = filters.colors.includes(color.code)
                  return (
                    <button
                      key={color.code}
                      type="button"
                      className={`filt__pip${on ? ' is-on' : ''}`}
                      style={
                        { '--pip': color.swatch, '--pip-ink': color.ink } as React.CSSProperties
                      }
                      onClick={() => toggleColor(color.code)}
                      aria-pressed={on}
                      aria-label={color.label}
                      title={color.label}
                    >
                      {color.symbol}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="filt">
              <span className="filt__label">Type</span>
              <input
                type="text"
                value={filters.type}
                onChange={(event) => setFilters({ type: event.target.value })}
                placeholder="creature, instant…"
              />
            </label>

            <label className="filt">
              <span className="filt__label">Subtype</span>
              <input
                type="text"
                value={filters.subtype}
                onChange={(event) => setFilters({ subtype: event.target.value })}
                placeholder="goblin, equipment…"
              />
            </label>

            <div className="filt">
              <span className="filt__label">Mana value</span>
              <div className="filt__range">
                <input
                  type="number"
                  min={0}
                  value={filters.manaMin}
                  onChange={(event) => setFilters({ manaMin: event.target.value })}
                  placeholder="Min"
                  aria-label="Minimum mana value"
                />
                <span className="filt__dash">–</span>
                <input
                  type="number"
                  min={0}
                  value={filters.manaMax}
                  onChange={(event) => setFilters({ manaMax: event.target.value })}
                  placeholder="Max"
                  aria-label="Maximum mana value"
                />
              </div>
            </div>

            <label className="filt">
              <span className="filt__label">Rarity</span>
              <select
                value={filters.rarity}
                onChange={(event) => setFilters({ rarity: event.target.value })}
              >
                <option value="">Any</option>
                {RARITIES.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity}
                  </option>
                ))}
              </select>
            </label>

            <label className="filt">
              <span className="filt__label">Format</span>
              <select
                value={filters.format}
                onChange={(event) => setFilters({ format: event.target.value })}
              >
                <option value="">Any</option>
                {FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </select>
            </label>

            <label className="filt">
              <span className="filt__label">Set</span>
              <input
                type="text"
                value={filters.set}
                onChange={(event) => setFilters({ set: event.target.value })}
                placeholder="set code, e.g. mh3"
              />
            </label>

            <label className="filt">
              <span className="filt__label">Artist</span>
              <input
                type="text"
                value={filters.artist}
                onChange={(event) => setFilters({ artist: event.target.value })}
                placeholder="e.g. John Avon"
              />
            </label>

            <label className="filt">
              <span className="filt__label">Language</span>
              <select
                value={filters.language}
                onChange={(event) => setFilters({ language: event.target.value })}
              >
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {view === 'decks' && (
          <p className="sidebar__hint">Your decks and their stats are in the main panel.</p>
        )}
        {view === 'settings' && (
          <p className="sidebar__hint">Print, upscale, and cache settings are in the main panel.</p>
        )}
      </div>

      <div className="sidebar__footer">
        <PrintPartner />
      </div>
    </aside>
  )
}
