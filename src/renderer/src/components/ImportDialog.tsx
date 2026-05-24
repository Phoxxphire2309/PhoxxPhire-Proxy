import { useEffect, useState } from 'react'
import type { ImportProgress } from '@shared/decklist'
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
  const [excludeFoils, setExcludeFoils] = useState(true)
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  useEffect(() => {
    const unsubscribe = window.phoxx.onImportProgress(setProgress)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !importing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, importing])

  const submit = async (): Promise<void> => {
    setProgress(null)
    await importText(text, excludeFoils)
    onClose()
  }

  const submitUrl = async (): Promise<void> => {
    setProgress(null)
    await importUrl(url, excludeFoils)
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
        <label className="export__field export__field--inline">
          <input
            type="checkbox"
            checked={excludeFoils}
            onChange={(event) => setExcludeFoils(event.target.checked)}
          />
          <span>Exclude foils — use the cheapest non-foil printing (foils print poorly)</span>
        </label>

        {importing && progress && (
          <div className="import__progress" role="status" aria-live="polite">
            <div className="upscale-progress__bar">
              <div
                className="upscale-progress__fill"
                style={{ width: `${(progress.completed / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
            <span className="import__progress-label">
              Resolving {progress.completed}/{progress.total} — {progress.name}
            </span>
          </div>
        )}

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
