import type { Card } from '@shared/scryfall'
import { useSearchStore } from '@renderer/state/searchStore'
import { usePrintingStore } from '@renderer/state/printingStore'
import { useDeckStore } from '@renderer/state/deckStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { CardTile } from '@renderer/components/CardTile'

function GridItem({ card }: { card: Card }): React.JSX.Element {
  const override = usePrintingStore((state) => state.overrides[card.id])
  const open = usePrintingStore((state) => state.open)
  const add = useDeckStore((state) => state.add)
  const displayed = override ?? card
  return <CardTile card={displayed} onOpen={() => open(card.id)} onAdd={() => add(displayed)} />
}

export function CardGrid(): React.JSX.Element {
  const status = useSearchStore((state) => state.status)
  const error = useSearchStore((state) => state.error)
  const cards = useSearchStore((state) => state.cards)
  const totalCards = useSearchStore((state) => state.totalCards)
  const overrides = usePrintingStore((state) => state.overrides)
  const available = useUpscaleStore((state) => state.available) === true
  const markManyUpscaled = useUpscaleStore((state) => state.markManyUpscaled)

  if (status === 'error') {
    return <p className="grid__message grid__message--error">{error}</p>
  }

  if (status === 'loading') {
    return <p className="grid__message">Searching Scryfall…</p>
  }

  if (cards.length === 0) {
    return <p className="grid__message">No cards yet — try a search above.</p>
  }

  const upscaleAll = (): void =>
    markManyUpscaled(cards.map((card) => (overrides[card.id] ?? card).id))

  return (
    <>
      <div className="grid__bar">
        <p className="grid__count">
          Showing {cards.length} of {totalCards} card{totalCards === 1 ? '' : 's'}
        </p>
        {available && (
          <button className="toggle" type="button" onClick={upscaleAll}>
            Upscale all
          </button>
        )}
      </div>
      <ul className="grid">
        {cards.map((card) => (
          <li key={card.id} className="grid__item">
            <GridItem card={card} />
          </li>
        ))}
      </ul>
    </>
  )
}
