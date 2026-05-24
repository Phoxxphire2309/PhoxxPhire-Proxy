import { useEffect, useState } from 'react'
import { useDeckStore } from '@renderer/state/deckStore'
import { toast } from '@renderer/state/toastStore'

const BASICS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const
type Basic = (typeof BASICS)[number]

const SWATCH: Record<Basic, string> = {
  Plains: '#f3e9c6',
  Island: '#3b82f6',
  Swamp: '#5b5563',
  Mountain: '#ef4444',
  Forest: '#22a55b'
}

/** Quick-add the five basic lands with chosen quantities. */
export function BasicLandDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const add = useDeckStore((state) => state.add)
  const [counts, setCounts] = useState<Record<Basic, number>>({
    Plains: 0,
    Island: 0,
    Swamp: 0,
    Mountain: 0,
    Forest: 0
  })
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !adding) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, adding])

  const setCount = (basic: Basic, value: number): void =>
    setCounts((current) => ({ ...current, [basic]: Math.max(0, value) }))

  const total = BASICS.reduce((sum, basic) => sum + counts[basic], 0)

  const addLands = async (): Promise<void> => {
    setAdding(true)
    let added = 0
    try {
      for (const basic of BASICS) {
        const quantity = counts[basic]
        if (quantity <= 0) continue
        const result = await window.phoxx.searchCards(`!"${basic}" type:basic`)
        const card = result.cards[0]
        if (card) {
          add(card, quantity)
          added += quantity
        }
      }
      toast(added > 0 ? `Added ${added} basic land(s)` : 'No lands added', 'success')
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not add basic lands', 'error')
      setAdding(false)
    }
  }

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Add basic lands">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">Basic lands</h2>
        <p className="detail__hint">Set how many of each basic land to add to the deck.</p>

        <ul className="tokens__list">
          {BASICS.map((basic) => (
            <li className="tokens__item" key={basic}>
              <span className="stats__swatch" style={{ background: SWATCH[basic] }} aria-hidden />
              <div className="tokens__info">
                <span className="ditem__name">{basic}</span>
              </div>
              <div className="ditem__qty">
                <button
                  type="button"
                  onClick={() => setCount(basic, counts[basic] - 1)}
                  aria-label={`Decrease ${basic}`}
                >
                  −
                </button>
                <span className="ditem__count">{counts[basic]}</span>
                <button
                  type="button"
                  onClick={() => setCount(basic, counts[basic] + 1)}
                  aria-label={`Increase ${basic}`}
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="import__actions">
          <button
            className="search__button"
            type="button"
            disabled={adding || total === 0}
            onClick={() => void addLands()}
          >
            {adding ? 'Adding…' : `Add ${total} land(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
