import { bestUsd, type Card } from './scryfall'

/**
 * How to order the deck's cards (within each group, when grouped). Mirrors the
 * search results' sort options, minus the ones that need data the deck doesn't
 * carry (relevance, release date). `manual` keeps the order cards were added.
 */
export const DECK_SORT_OPTIONS = [
  { key: 'manual', label: 'Added order' },
  { key: 'name-asc', label: 'Name: A → Z' },
  { key: 'name-desc', label: 'Name: Z → A' },
  { key: 'cmc-asc', label: 'Mana value: low → high' },
  { key: 'cmc-desc', label: 'Mana value: high → low' },
  { key: 'price-asc', label: 'Price: low → high' },
  { key: 'price-desc', label: 'Price: high → low' }
] as const

export type DeckSortKey = (typeof DECK_SORT_OPTIONS)[number]['key']

interface Sortable {
  card: Card
}

/** Returns a new array of `items` ordered by `by`; `manual` returns it unchanged. */
export function sortDeckItems<T extends Sortable>(items: T[], by: DeckSortKey): T[] {
  if (by === 'manual') return items

  const byName = (a: T, b: T): number => a.card.name.localeCompare(b.card.name)
  const copy = [...items]
  copy.sort((a, b) => {
    switch (by) {
      case 'name-asc':
        return byName(a, b)
      case 'name-desc':
        return byName(b, a)
      case 'cmc-asc':
        return (a.card.cmc ?? 0) - (b.card.cmc ?? 0) || byName(a, b)
      case 'cmc-desc':
        return (b.card.cmc ?? 0) - (a.card.cmc ?? 0) || byName(a, b)
      case 'price-asc':
        return (bestUsd(a.card.prices) ?? 0) - (bestUsd(b.card.prices) ?? 0) || byName(a, b)
      case 'price-desc':
        return (bestUsd(b.card.prices) ?? 0) - (bestUsd(a.card.prices) ?? 0) || byName(a, b)
      default:
        return 0
    }
  })
  return copy
}
