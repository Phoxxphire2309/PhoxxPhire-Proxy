import { isHighRes, type Card } from '@shared/scryfall'
import { confirm } from '@renderer/state/confirmStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'

const allFaces = (cards: Card[]): { cardId: string; faceIndex: number }[] =>
  cards.flatMap((card) => card.faces.map((_face, faceIndex) => ({ cardId: card.id, faceIndex })))

/**
 * Upscales a single card, but first confirms when it already has a
 * high-resolution scan (where upscaling rarely helps and just costs time).
 */
export async function upscaleCardWithConfirm(card: Card): Promise<void> {
  if (isHighRes(card)) {
    const choice = await confirm({
      title: 'Already high-resolution',
      message: `${card.name} already has a high-resolution scan, so upscaling rarely improves it. Upscale anyway?`,
      options: [{ id: 'go', label: 'Upscale anyway' }]
    })
    if (choice !== 'go') return
  }
  useUpscaleStore.getState().runUpscale(allFaces([card]))
}

/**
 * Pre-upscales a deck, asking whether to do every card or only those that
 * aren't already high-resolution. Resolves to the number of cards queued.
 */
export async function preUpscaleDeckWithConfirm(cards: Card[]): Promise<void> {
  if (cards.length === 0) return
  const lowRes = cards.filter((card) => !isHighRes(card))
  // Nothing to skip — go straight ahead rather than offering an identical choice.
  if (lowRes.length === cards.length) {
    useUpscaleStore.getState().runUpscale(allFaces(cards))
    return
  }

  const choice = await confirm({
    title: 'Pre-upscale deck',
    message: `Upscale all ${cards.length} cards, or only the ${lowRes.length} that aren't already high-resolution?`,
    options: [
      { id: 'low', label: `Only low-res (${lowRes.length})`, primary: true },
      { id: 'all', label: `All ${cards.length}` }
    ]
  })
  if (choice === 'all') useUpscaleStore.getState().runUpscale(allFaces(cards))
  else if (choice === 'low') useUpscaleStore.getState().runUpscale(allFaces(lowRes))
}
