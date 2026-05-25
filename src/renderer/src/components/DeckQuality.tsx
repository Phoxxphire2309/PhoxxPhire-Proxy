import { useEffect, useMemo } from 'react'
import { faceImageUrl, isHighRes, type Card } from '@shared/scryfall'
import { isPrintableSection } from '@shared/deck'
import { useDeckStore, type BulkPrintingMode } from '@renderer/state/deckStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { useTextProxyStore } from '@renderer/state/textProxyStore'
import { preUpscaleDeckWithConfirm } from '@renderer/state/upscaleActions'

const isRealCard = (typeLine: string | undefined): boolean => !/Token|Emblem/.test(typeLine ?? '')

type Grade = 'hd' | 'upscaled' | 'lowres' | 'proxy'

const GRADE_LABEL: Record<Grade, string> = {
  hd: 'HD scan',
  upscaled: 'Upscaled',
  lowres: 'Low-res',
  proxy: 'Text proxy'
}

// Worst-first, so cards that need attention sort to the top.
const GRADE_ORDER: Grade[] = ['lowres', 'proxy', 'upscaled', 'hd']

/**
 * A print-quality report for the deck: every printable card graded as an HD
 * scan, an upscaled image, a low-res scan, or a text proxy — with a one-click
 * "raise all to best quality" (switch to the best scan, then upscale the rest).
 */
export function DeckQuality({ onClose }: { onClose: () => void }): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const bulkSwitchPrintings = useDeckStore((state) => state.bulkSwitchPrintings)
  const bulkRunning = useDeckStore((state) => state.bulkRunning)
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  const upscaled = useUpscaleStore((state) => state.upscaled)
  const proxies = useTextProxyStore((state) => state.proxies)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const gradeOf = (card: Card): Grade => {
    if (proxies[card.id]) return 'proxy'
    if (isHighRes(card)) return 'hd'
    if (upscaled[card.id]) return 'upscaled'
    return 'lowres'
  }

  const graded = useMemo(() => {
    const cards = items
      .filter((item) => isPrintableSection(item.section) && isRealCard(item.card.typeLine))
      .map((item) => item.card)
    const rows = cards.map((card) => ({ card, grade: gradeOf(card) }))
    rows.sort(
      (a, b) =>
        GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) ||
        a.card.name.localeCompare(b.card.name)
    )
    const counts: Record<Grade, number> = { hd: 0, upscaled: 0, lowres: 0, proxy: 0 }
    for (const row of rows) counts[row.grade] += 1
    return { rows, counts }
    // gradeOf depends on the live upscaled/proxies maps, captured each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, upscaled, proxies])

  const lowResCount = graded.counts.lowres

  const raiseAll = async (): Promise<void> => {
    // Best scan first (swaps low-res printings for a higher-res one where it
    // exists), then upscale whatever is still low-res.
    await bulkSwitchPrintings('highres' as BulkPrintingMode)
    if (!upscalerAvailable) return
    const stillLow = useDeckStore
      .getState()
      .items.filter((item) => isPrintableSection(item.section) && isRealCard(item.card.typeLine))
      .map((item) => item.card)
      .filter((card) => !isHighRes(card) && !useUpscaleStore.getState().upscaled[card.id])
    if (stillLow.length > 0) await preUpscaleDeckWithConfirm(stillLow)
  }

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Deck print quality">
      <button className="detail__backdrop" type="button" aria-label="Close" onClick={onClose} />
      <div className="detail__panel import">
        <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h2 className="detail__name">Print quality</h2>

        {graded.rows.length === 0 ? (
          <p className="detail__hint">No printable cards in this deck yet.</p>
        ) : (
          <>
            <div className="qreport__summary">
              {GRADE_ORDER.filter((grade) => graded.counts[grade] > 0).map((grade) => (
                <span className={`quality quality--${grade}`} key={grade}>
                  {graded.counts[grade]} {GRADE_LABEL[grade]}
                </span>
              ))}
            </div>

            {lowResCount > 0 && (
              <button
                className="deck__export"
                type="button"
                onClick={() => void raiseAll()}
                disabled={bulkRunning}
              >
                {bulkRunning
                  ? 'Raising quality…'
                  : `✦ Raise all to best quality (${lowResCount} low-res)`}
              </button>
            )}

            <ul className="qreport__list">
              {graded.rows.map(({ card, grade }) => (
                <li className="qrow" key={card.id}>
                  <img
                    className="qrow__thumb"
                    src={faceImageUrl(card.id, 0, proxies[card.id] ? 'proxy' : 'thumb')}
                    alt=""
                    loading="lazy"
                    draggable={false}
                  />
                  <span className="qrow__name" title={card.name}>
                    {card.name}
                  </span>
                  <span className="qrow__set">{card.setCode.toUpperCase()}</span>
                  <span className={`quality quality--${grade}`}>{GRADE_LABEL[grade]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
