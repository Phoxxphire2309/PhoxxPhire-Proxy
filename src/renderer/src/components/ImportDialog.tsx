import { useEffect, useState } from 'react'
import { useDeckStore } from '@renderer/state/deckStore'

const PLACEHOLDER = `4 Lightning Bolt
2 Counterspell
1 Sol Ring (C21) 263`

export function ImportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const importText = useDeckStore((state) => state.importText)
  const importUrl = useDeckStore((state) => state.importUrl)
  const importing = useDeckStore((state) => state.importing)
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = async (): Promise<void> => {
    await importText(text)
    onClose()
  }

  const submitUrl = async (): Promise<void> => {
    await importUrl(url)
    onClose()
  }

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Import decklist">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">Import decklist</h2>

        <p className="detail__hint">From an Archidekt or Moxfield deck URL:</p>
        <div className="import__url">
          <input
            className="search__input"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://archidekt.com/decks/123456"
            aria-label="Deck URL"
            spellCheck={false}
          />
          <button
            className="toggle"
            type="button"
            disabled={importing || !url.trim()}
            onClick={() => void submitUrl()}
          >
            {importing ? 'Fetching…' : 'Fetch'}
          </button>
        </div>

        <p className="detail__hint">
          …or paste a decklist — plain text or MTG Arena format (e.g. “4 Lightning Bolt (M21) 159”).
          Lines that can’t be matched are reported afterwards.
        </p>
        <textarea
          className="import__textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={12}
          placeholder={PLACEHOLDER}
          aria-label="Decklist text"
          spellCheck={false}
        />
        <div className="import__actions">
          <button
            className="search__button"
            type="button"
            disabled={importing || !text.trim()}
            onClick={() => void submit()}
          >
            {importing ? 'Resolving…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
