import { useEffect, useRef, useState } from 'react'
import { useDecksStore } from '@renderer/state/decksStore'

/** Tab bar for switching between multiple decks. */
export function DeckTabs(): React.JSX.Element {
  const tabs = useDecksStore((state) => state.tabs)
  const activeId = useDecksStore((state) => state.activeId)
  const switchTab = useDecksStore((state) => state.switchTab)
  const newTab = useDecksStore((state) => state.newTab)
  const closeTab = useDecksStore((state) => state.closeTab)
  const renameTab = useDecksStore((state) => state.renameTab)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the rename field when it opens (avoids the autoFocus a11y pitfall).
  useEffect(() => {
    if (editingId) inputRef.current?.select()
  }, [editingId])

  const commitRename = (): void => {
    if (editingId) renameTab(editingId, draft)
    setEditingId(null)
  }

  return (
    <div className="tabs" role="tablist" aria-label="Decks">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tabs__tab${tab.id === activeId ? ' is-active' : ''}`}
          role="tab"
          aria-selected={tab.id === activeId}
        >
          {editingId === tab.id ? (
            <input
              ref={inputRef}
              className="tabs__rename"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename()
                else if (event.key === 'Escape') setEditingId(null)
              }}
              aria-label="Rename deck"
            />
          ) : (
            <button
              type="button"
              className="tabs__label"
              onClick={() => switchTab(tab.id)}
              onDoubleClick={() => {
                setEditingId(tab.id)
                setDraft(tab.name)
              }}
              title="Click to switch · double-click to rename"
            >
              {tab.name}
            </button>
          )}
          <button
            type="button"
            className="tabs__close"
            onClick={() => closeTab(tab.id)}
            aria-label={`Close ${tab.name}`}
            title="Close deck"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="tabs__new"
        onClick={newTab}
        aria-label="New deck"
        title="New deck"
      >
        ＋
      </button>
    </div>
  )
}
