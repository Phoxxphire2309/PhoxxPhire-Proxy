import { useEffect, useState } from 'react'
import { faceImageUrl, type Card } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'
import { toast } from '@renderer/state/toastStore'

type Phase = 'loading' | 'ready' | 'error'

/**
 * Scans the current deck for the tokens and emblems its cards create (via
 * Scryfall's related-parts data) and lets the user add the ones they want.
 */
export function TokenDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const add = useDeckStore((state) => state.add)
  const [phase, setPhase] = useState<Phase>('loading')
  const [tokens, setTokens] = useState<Card[]>([])
  const [message, setMessage] = useState('')
  // token id → quantity to add (0 = not selected); defaults to 1 each.
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  useEffect(() => {
    const cardIds = items.map((item) => item.card.id)
    let cancelled = false
    void (async () => {
      try {
        const found = await window.phoxx.findTokens(cardIds)
        if (cancelled) return
        setTokens(found)
        setQuantities(Object.fromEntries(found.map((token) => [token.id, 1])))
        setPhase('ready')
      } catch (error) {
        if (cancelled) return
        setMessage(error instanceof Error ? error.message : 'Could not look up tokens')
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // Snapshot the deck once on open; re-running mid-dialog isn't desired.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setQuantity = (id: string, value: number): void =>
    setQuantities((current) => ({ ...current, [id]: Math.max(0, value) }))

  const selectedCount = tokens.filter((token) => (quantities[token.id] ?? 0) > 0).length

  const addSelected = (): void => {
    let added = 0
    for (const token of tokens) {
      const quantity = quantities[token.id] ?? 0
      if (quantity > 0) {
        add(token, quantity)
        added += 1
      }
    }
    if (added > 0) toast(`Added ${added} token type(s) to the deck`, 'success')
    onClose()
  }

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Add tokens">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">Tokens &amp; emblems</h2>

        {phase === 'loading' && <p className="detail__hint">Scanning the deck for tokens…</p>}
        {phase === 'error' && <p className="export__error">{message}</p>}

        {phase === 'ready' && tokens.length === 0 && (
          <p className="detail__hint">
            None of the cards in this deck create tokens or emblems (or they’re already in the
            deck).
          </p>
        )}

        {phase === 'ready' && tokens.length > 0 && (
          <>
            <p className="detail__hint">
              {tokens.length} token{tokens.length === 1 ? '' : 's'} found. Set a quantity (0 to
              skip) and add the ones you want.
            </p>
            <ul className="pickgrid">
              {tokens.map((token) => {
                const quantity = quantities[token.id] ?? 0
                return (
                  <li className="pickgrid__item" key={token.id}>
                    <div className="pickgrid__art">
                      <img
                        src={faceImageUrl(token.id, 0, 'thumb')}
                        alt={token.name}
                        loading="lazy"
                        draggable={false}
                      />
                    </div>
                    <div className="pickgrid__bar">
                      <div className="dgrid__qty">
                        <button
                          type="button"
                          onClick={() => setQuantity(token.id, quantity - 1)}
                          aria-label={`Decrease ${token.name}`}
                        >
                          −
                        </button>
                        <span>{quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(token.id, quantity + 1)}
                          aria-label={`Increase ${token.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <span className="pickgrid__name" title={token.name}>
                      {token.name}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="import__actions">
              <button
                className="search__button"
                type="button"
                disabled={selectedCount === 0}
                onClick={addSelected}
              >
                Add {selectedCount} token type(s)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
