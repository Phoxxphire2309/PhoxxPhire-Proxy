import { useEffect, useMemo, useRef, useState } from 'react'
import { useUiStore } from '@renderer/state/uiStore'
import { useDecksStore } from '@renderer/state/decksStore'
import { useDeckStore } from '@renderer/state/deckStore'
import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { usePaletteStore } from '@renderer/state/paletteStore'

interface Command {
  id: string
  label: string
  group: string
  hint?: string
  run: () => void
}

/**
 * A ⌘K command palette: fuzzy-filterable list of navigation and actions
 * (jump views, switch decks, open dialogs, undo/redo, theme). Composes the
 * existing stores so every command is the same action a button would trigger.
 */
export function CommandPalette(): React.JSX.Element | null {
  const open = usePaletteStore((state) => state.open)
  const setOpen = usePaletteStore((state) => state.setOpen)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const setView = useUiStore((state) => state.setView)
  const toggleTheme = useUiStore((state) => state.toggleTheme)
  const setTourOpen = useUiStore((state) => state.setTourOpen)
  const tabs = useDecksStore((state) => state.tabs)
  const activeDeckId = useDecksStore((state) => state.activeId)
  const switchTab = useDecksStore((state) => state.switchTab)
  const undo = useDeckStore((state) => state.undo)
  const redo = useDeckStore((state) => state.redo)
  const addCustomCard = useDeckStore((state) => state.addCustomCard)
  const openModal = useDeckUiStore((state) => state.open)

  const commands = useMemo<Command[]>(() => {
    const go = (view: 'search' | 'decks' | 'settings', focusSearch = false): (() => void) => {
      return () => {
        setView(view)
        if (focusSearch) setTimeout(() => document.getElementById('card-search')?.focus(), 0)
      }
    }
    const list: Command[] = [
      { id: 'nav-search', label: 'Search cards', group: 'Go to', run: go('search', true) },
      { id: 'nav-decks', label: 'Go to Decks', group: 'Go to', run: go('decks') },
      { id: 'nav-settings', label: 'Go to Settings', group: 'Go to', run: go('settings') }
    ]

    // Switch between deck tabs (skip the one already active).
    for (const tab of tabs) {
      if (tab.id === activeDeckId) continue
      list.push({
        id: `deck-${tab.id}`,
        label: `Switch to deck: ${tab.name}`,
        group: 'Decks',
        run: () => {
          switchTab(tab.id)
          setView('decks')
        }
      })
    }

    const deckAction =
      (modal: Parameters<typeof openModal>[0]): (() => void) =>
      () => {
        setView('decks')
        openModal(modal)
      }
    list.push(
      { id: 'act-import', label: 'Import decklist', group: 'Decks', run: deckAction('import') },
      {
        id: 'act-custom',
        label: 'Add custom card',
        group: 'Decks',
        run: () => {
          setView('decks')
          void addCustomCard()
        }
      },
      { id: 'act-export', label: 'Export PDF', group: 'Decks', run: deckAction('export') },
      { id: 'act-preview', label: 'Print preview', group: 'Decks', run: deckAction('preview') },
      { id: 'act-sample', label: 'Sample hand', group: 'Decks', run: deckAction('sampleHand') },
      { id: 'act-combos', label: 'Find combos', group: 'Decks', run: deckAction('combos') },
      { id: 'act-tokens', label: 'Add tokens', group: 'Decks', run: deckAction('tokens') },
      { id: 'act-lands', label: 'Add basic lands', group: 'Decks', run: deckAction('lands') },
      { id: 'act-pagesetup', label: 'Page setup', group: 'Decks', run: deckAction('pageSetup') },
      {
        id: 'act-undo',
        label: 'Undo',
        group: 'Edit',
        hint: '⌘Z',
        run: () => {
          setView('decks')
          undo()
        }
      },
      {
        id: 'act-redo',
        label: 'Redo',
        group: 'Edit',
        hint: '⇧⌘Z',
        run: () => {
          setView('decks')
          redo()
        }
      },
      { id: 'theme', label: 'Toggle light / dark theme', group: 'App', run: toggleTheme },
      { id: 'tour', label: 'Start the guided tour', group: 'App', run: () => setTourOpen(true) }
    )
    return list
  }, [
    tabs,
    activeDeckId,
    setView,
    switchTab,
    openModal,
    addCustomCard,
    undo,
    redo,
    toggleTheme,
    setTourOpen
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((command) => command.label.toLowerCase().includes(q))
  }, [commands, query])

  // Reset query/selection each time the palette opens, and focus the input.
  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Keep the active item from running off the end as the filter narrows.
  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  if (!open) return null

  const run = (command: Command | undefined): void => {
    if (!command) return
    setOpen(false)
    command.run()
  }

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((current) => Math.min(filtered.length - 1, current + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((current) => Math.max(0, current - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(filtered[active])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  // Render with group headers, but track a flat index for keyboard selection.
  let flatIndex = -1
  let lastGroup = ''

  return (
    <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <button
        className="palette__backdrop"
        type="button"
        aria-label="Close"
        onClick={() => setOpen(false)}
      />
      <div className="palette__panel">
        <input
          ref={inputRef}
          className="palette__input"
          type="text"
          value={query}
          placeholder="Type a command…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Command search"
        />
        {filtered.length === 0 ? (
          <p className="palette__empty">No matching commands.</p>
        ) : (
          <ul className="palette__list" ref={listRef}>
            {filtered.map((command) => {
              flatIndex += 1
              const index = flatIndex
              const showGroup = command.group !== lastGroup
              lastGroup = command.group
              return (
                <li key={command.id}>
                  {showGroup && <p className="palette__group">{command.group}</p>}
                  <button
                    type="button"
                    className={`palette__item${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(command)}
                  >
                    <span className="palette__label">{command.label}</span>
                    {command.hint && <span className="palette__hint">{command.hint}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
