import { useEffect, useRef, useState } from 'react'
import { useSearchStore } from '@renderer/state/searchStore'

export function SearchBar(): React.JSX.Element {
  const query = useSearchStore((state) => state.query)
  const status = useSearchStore((state) => state.status)
  const setQuery = useSearchStore((state) => state.setQuery)
  const search = useSearchStore((state) => state.search)

  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const suppressNext = useRef(false)

  // Debounced autocomplete as the user types.
  useEffect(() => {
    if (suppressNext.current) {
      suppressNext.current = false
      return
    }
    const term = query.trim()
    if (term.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    const timer = setTimeout(() => {
      window.phoxx
        .autocomplete(term)
        .then((results) => {
          setSuggestions(results)
          setOpen(results.length > 0)
          setHighlight(-1)
        })
        .catch(() => setSuggestions([]))
    }, 220)
    return () => clearTimeout(timer)
  }, [query])

  const choose = (value: string): void => {
    suppressNext.current = true
    setQuery(value)
    setOpen(false)
    void search()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!open || suggestions.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((index) => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((index) => (index - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter' && highlight >= 0) {
      event.preventDefault()
      choose(suggestions[highlight]!)
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <form
      className="search"
      onSubmit={(event) => {
        event.preventDefault()
        setOpen(false)
        void search()
      }}
    >
      <div className="search__box">
        <input
          id="card-search"
          className="search__input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Search Scryfall — e.g. lightning bolt, t:goblin, set:mh3"
          aria-label="Card search query"
          autoComplete="off"
          spellCheck={false}
        />
        {open && (
          <ul className="search__suggestions">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion}>
                <button
                  type="button"
                  className={`search__suggestion${index === highlight ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="search__button" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Searching…' : 'Search'}
      </button>
    </form>
  )
}
