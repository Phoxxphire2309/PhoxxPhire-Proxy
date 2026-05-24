import { useEffect, useState } from 'react'
import { useCollectionStore } from '@renderer/state/collectionStore'
import { toast } from '@renderer/state/toastStore'

const PLACEHOLDER = `4 Lightning Bolt
Sol Ring
2 Counterspell`

/** Manage the owned-card collection: paste owned cards, toggle skip-on-export, clear. */
export function CollectionDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const importOwned = useCollectionStore((state) => state.importOwned)
  const clearOwned = useCollectionStore((state) => state.clearOwned)
  const ownedCount = useCollectionStore((state) => Object.keys(state.owned).length)
  const skipOwned = useCollectionStore((state) => state.skipOwned)
  const setSkipOwned = useCollectionStore((state) => state.setSkipOwned)
  const [text, setText] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const doImport = (): void => {
    const added = importOwned(text)
    toast(
      added > 0 ? `Added ${added} card(s) to your collection` : 'No cards recognised',
      'success'
    )
    setText('')
  }

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Collection">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">My collection</h2>
        <p className="detail__hint">
          You own <strong>{ownedCount}</strong> distinct card(s). Paste cards you own (names, one
          per line; quantities are ignored).
        </p>

        <textarea
          className="import__textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={10}
          placeholder={PLACEHOLDER}
          aria-label="Owned cards"
          spellCheck={false}
        />

        <label className="export__field export__field--inline">
          <input
            type="checkbox"
            checked={skipOwned}
            onChange={(event) => setSkipOwned(event.target.checked)}
          />
          <span>Skip owned cards when exporting (you can still print individual ones)</span>
        </label>

        <div className="import__actions">
          <button
            className="toggle"
            type="button"
            disabled={ownedCount === 0}
            onClick={() => {
              clearOwned()
              toast('Collection cleared', 'success')
            }}
          >
            Clear
          </button>
          <button
            className="search__button"
            type="button"
            disabled={!text.trim()}
            onClick={doImport}
          >
            Add to collection
          </button>
        </div>
      </div>
    </div>
  )
}
