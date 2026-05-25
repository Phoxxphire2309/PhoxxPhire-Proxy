import { useEffect, useMemo, useState } from 'react'
import { isHighRes, type Card } from '@shared/scryfall'
import { isPrintableSection } from '@shared/deck'
import { useDeckStore } from '@renderer/state/deckStore'
import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { preUpscaleDeckWithConfirm } from '@renderer/state/upscaleActions'
import { toast } from '@renderer/state/toastStore'

/** Tokens/emblems aren't "real" deck cards for health purposes. */
const isRealCard = (typeLine: string | undefined): boolean => !/Token|Emblem/.test(typeLine ?? '')

/**
 * A one-glance readiness check for the current deck: flags low-resolution scans
 * and missing tokens, with one-click fixes (batch upscale / best scan, auto-add
 * tokens). Reuses the existing upscale and token-finding flows.
 */
export function DeckHealth(): React.JSX.Element | null {
  const items = useDeckStore((state) => state.items)
  const add = useDeckStore((state) => state.add)
  const bulkSwitchPrintings = useDeckStore((state) => state.bulkSwitchPrintings)
  const bulkRunning = useDeckStore((state) => state.bulkRunning)
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  // Subscribe to the upscaled set so the panel re-renders (and clears) once a
  // low-res card has been upscaled — upscaling never changes its source scan.
  const upscaled = useUpscaleStore((state) => state.upscaled)
  const open = useDeckUiStore((state) => state.open)
  const [missingTokens, setMissingTokens] = useState<Card[]>([])

  // Printable, real (non-token) cards — the ones we actually assess.
  const cards = useMemo(
    () =>
      items
        .filter((item) => isPrintableSection(item.section) && isRealCard(item.card.typeLine))
        .map((item) => item.card),
    [items]
  )
  const idsKey = cards.map((card) => card.id).join(',')

  // A card needs attention when its source scan is low-res and it hasn't been
  // upscaled (the "Best scan" fix instead swaps in a high-res printing, which
  // makes isHighRes true and drops it from this list directly).
  const lowRes = cards.filter((card) => !isHighRes(card) && !upscaled[card.id])

  // Detected tokens this deck creates that aren't already in it.
  useEffect(() => {
    let active = true
    const ids = idsKey ? idsKey.split(',') : []
    if (ids.length === 0) {
      setMissingTokens([])
      return
    }
    window.phoxx
      .findTokens(ids)
      .then((tokens) => active && setMissingTokens(tokens))
      .catch(() => active && setMissingTokens([]))
    return () => {
      active = false
    }
  }, [idsKey])

  if (cards.length === 0) return null

  const fixLowRes = (): void => {
    if (upscalerAvailable) void preUpscaleDeckWithConfirm(lowRes)
    else void bulkSwitchPrintings('highres')
  }

  const addTokens = (): void => {
    for (const token of missingTokens) add(token, 1)
    if (missingTokens.length > 0) {
      toast(`Added ${missingTokens.length} token type(s) to the deck`, 'success')
    }
  }

  const issues = lowRes.length > 0 || missingTokens.length > 0

  const fixAll = (): void => {
    if (lowRes.length > 0) fixLowRes()
    if (missingTokens.length > 0) addTokens()
  }

  if (!issues) {
    return (
      <div className="dhealth dhealth--ok">
        <span className="dhealth__dot dhealth__dot--ok" aria-hidden="true" />
        <span className="dhealth__oktext">Print-ready — every card is high-resolution.</span>
      </div>
    )
  }

  return (
    <div className="dhealth">
      <div className="dhealth__head">
        <span className="dhealth__title">Deck health</span>
        <button className="dhealth__fixall" type="button" onClick={fixAll} disabled={bulkRunning}>
          Fix all
        </button>
      </div>
      <ul className="dhealth__issues">
        {lowRes.length > 0 && (
          <li className="dhealth__issue">
            <span className="dhealth__dot dhealth__dot--warn" aria-hidden="true" />
            <span className="dhealth__label">{lowRes.length} low-resolution</span>
            <button
              className="dhealth__fix"
              type="button"
              onClick={fixLowRes}
              disabled={bulkRunning}
            >
              {upscalerAvailable ? 'Upscale' : 'Best scan'}
            </button>
          </li>
        )}
        {missingTokens.length > 0 && (
          <li className="dhealth__issue">
            <span className="dhealth__dot dhealth__dot--info" aria-hidden="true" />
            <span className="dhealth__label">{missingTokens.length} missing token(s)</span>
            <button className="dhealth__fix" type="button" onClick={() => open('tokens')}>
              Review
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
