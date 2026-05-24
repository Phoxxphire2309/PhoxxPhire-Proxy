import { useCallback, useEffect, useMemo, useState } from 'react'
import { faceImageUrl } from '@shared/scryfall'
import { buildLibrary, shuffle, type LibraryCard, type LibrarySource } from '@shared/sampleHand'
import { useDeckStore } from '@renderer/state/deckStore'

const OPENING_HAND = 7

/** A playtest tool: shuffle the main deck and draw a sample opening hand. */
export function SampleHand({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)

  // The library is the main deck only: the command zone, sideboard, maybeboard,
  // and tokens/emblems are never drawn into an opening hand.
  const sources = useMemo<LibrarySource[]>(
    () =>
      items
        .filter((item) => item.section === 'main' && !/Token|Emblem/.test(item.card.typeLine ?? ''))
        .map((item) => ({
          cardId: item.card.id,
          name: item.card.name,
          copies: item.quantities[0] ?? 0
        }))
        .filter((source) => source.copies > 0),
    [items]
  )
  const librarySize = useMemo(() => buildLibrary(sources).length, [sources])

  const [library, setLibrary] = useState<LibraryCard[]>([])
  const [drawn, setDrawn] = useState(0)
  const [mulligans, setMulligans] = useState(0)

  const deal = useCallback(
    (isMulligan: boolean) => {
      const shuffled = shuffle(buildLibrary(sources))
      setLibrary(shuffled)
      setDrawn(Math.min(OPENING_HAND, shuffled.length))
      setMulligans((count) => (isMulligan ? count + 1 : 0))
    },
    [sources]
  )

  // Deal the first hand when the deck (and so the source list) is ready.
  useEffect(() => {
    deal(false)
  }, [deal])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hand = library.slice(0, drawn)
  const remaining = library.length - drawn

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Sample opening hand">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel hand">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">
          Sample hand{' '}
          <span className="preview__meta">
            {hand.length} card{hand.length === 1 ? '' : 's'} · {remaining} in library
            {mulligans > 0 ? ` · mulligan ${mulligans}` : ''}
          </span>
        </h2>

        {librarySize === 0 ? (
          <p className="detail__hint">
            No main-deck cards to draw. Add cards to the main deck (the command zone, sideboard, and
            maybeboard aren’t drawn).
          </p>
        ) : (
          <>
            <p className="detail__hint">
              Drawn from the {librarySize}-card main deck. Mulligan to redraw, or draw one more.
            </p>
            <div className="hand__cards">
              {hand.map((card, index) => (
                <img
                  key={`${card.cardId}:${index}`}
                  className="hand__card"
                  src={faceImageUrl(card.cardId, 0, 'source')}
                  alt={card.name}
                  title={card.name}
                  loading="lazy"
                  draggable={false}
                />
              ))}
            </div>
          </>
        )}

        <div className="import__actions preview__footer">
          <button className="toggle" type="button" onClick={() => deal(false)}>
            New hand
          </button>
          <button
            className="toggle"
            type="button"
            onClick={() => deal(true)}
            disabled={librarySize === 0}
          >
            Mulligan
          </button>
          <button
            className="search__button"
            type="button"
            onClick={() => setDrawn((count) => Math.min(count + 1, library.length))}
            disabled={remaining <= 0}
          >
            Draw a card
          </button>
        </div>
      </div>
    </div>
  )
}
