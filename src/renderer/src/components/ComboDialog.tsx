import { useEffect, useState } from 'react'
import type { ComboResult, DeckCombo } from '@shared/combo'
import { useDeckStore } from '@renderer/state/deckStore'

type Phase = 'loading' | 'ready' | 'error'

const isRealCard = (typeLine: string | undefined): boolean => !/Token|Emblem/.test(typeLine ?? '')

/** Lists the combos present in the current deck (via Commander Spellbook). */
export function ComboDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const [phase, setPhase] = useState<Phase>('loading')
  const [combos, setCombos] = useState<DeckCombo[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => {
    const cards = items
      .filter((item) => item.section !== 'maybeboard' && isRealCard(item.card.typeLine))
      .map((item) => ({
        name: item.card.name,
        quantity: item.quantities[0] ?? 1,
        commander: item.section === 'commander'
      }))
      .filter((card) => card.quantity > 0)

    let cancelled = false
    void (async () => {
      try {
        const result: ComboResult = await window.phoxx.findCombos(cards)
        if (cancelled) return
        if (result.ok) {
          setCombos(result.combos)
          setPhase('ready')
        } else {
          setMessage(result.error)
          setPhase('error')
        }
      } catch (error) {
        if (cancelled) return
        setMessage(error instanceof Error ? error.message : 'Could not look up combos')
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // Snapshot the deck once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Combos in this deck">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">
          Combos{' '}
          <span className="preview__meta">
            via{' '}
            <a href="https://commanderspellbook.com" target="_blank" rel="noreferrer">
              Commander Spellbook
            </a>
          </span>
        </h2>

        {phase === 'loading' && <p className="detail__hint">Looking up combos…</p>}
        {phase === 'error' && <p className="export__error">{message}</p>}
        {phase === 'ready' && combos.length === 0 && (
          <p className="detail__hint">No known combos found among these cards.</p>
        )}

        {phase === 'ready' && combos.length > 0 && (
          <>
            <p className="detail__hint">
              {combos.length} combo{combos.length === 1 ? '' : 's'} found in the deck.
            </p>
            <ul className="combos">
              {combos.map((combo) => (
                <li className="combo" key={combo.id}>
                  <div className="combo__cards">{combo.uses.join(' + ')}</div>
                  {combo.produces.length > 0 && (
                    <div className="combo__produces">→ {combo.produces.join(', ')}</div>
                  )}
                  {combo.description && <p className="combo__desc">{combo.description}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
