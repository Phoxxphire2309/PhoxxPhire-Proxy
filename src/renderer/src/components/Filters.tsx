import { useState } from 'react'
import { hasActiveFilters } from '@shared/scryfallQuery'
import { useSearchStore } from '@renderer/state/searchStore'

const COLORS: { code: string; label: string }[] = [
  { code: 'w', label: 'W' },
  { code: 'u', label: 'U' },
  { code: 'b', label: 'B' },
  { code: 'r', label: 'R' },
  { code: 'g', label: 'G' },
  { code: 'c', label: 'C' }
]

const RARITIES = ['common', 'uncommon', 'rare', 'mythic']
const FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'pauper', 'commander']

export function Filters(): React.JSX.Element {
  const filters = useSearchStore((state) => state.filters)
  const setFilters = useSearchStore((state) => state.setFilters)
  const resetFilters = useSearchStore((state) => state.resetFilters)
  const search = useSearchStore((state) => state.search)
  const [open, setOpen] = useState(false)

  const toggleColor = (code: string): void => {
    const colors = filters.colors.includes(code)
      ? filters.colors.filter((value) => value !== code)
      : [...filters.colors, code]
    setFilters({ colors })
  }

  const apply = (): void => void search()

  return (
    <div className="filters">
      <button
        type="button"
        className={`filters__toggle${hasActiveFilters(filters) ? ' is-active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        Filters{hasActiveFilters(filters) ? ' •' : ''}
      </button>

      {open && (
        <div className="filters__panel">
          <div className="filters__group">
            <span className="filters__label">Colors</span>
            <div className="filters__colors">
              {COLORS.map((color) => (
                <button
                  key={color.code}
                  type="button"
                  className={`filters__color${filters.colors.includes(color.code) ? ' is-on' : ''}`}
                  onClick={() => toggleColor(color.code)}
                  aria-pressed={filters.colors.includes(color.code)}
                >
                  {color.label}
                </button>
              ))}
            </div>
          </div>

          <label className="filters__group">
            <span className="filters__label">Type</span>
            <input
              type="text"
              value={filters.type}
              onChange={(event) => setFilters({ type: event.target.value })}
              placeholder="e.g. creature, instant"
            />
          </label>

          <label className="filters__group">
            <span className="filters__label">Rarity</span>
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

          <label className="filters__group">
            <span className="filters__label">Format</span>
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

          <label className="filters__group">
            <span className="filters__label">Set</span>
            <input
              type="text"
              value={filters.set}
              onChange={(event) => setFilters({ set: event.target.value })}
              placeholder="set code, e.g. mh3"
            />
          </label>

          <div className="filters__actions">
            <button type="button" className="toggle" onClick={resetFilters}>
              Reset
            </button>
            <button type="button" className="search__button" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
