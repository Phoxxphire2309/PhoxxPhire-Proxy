import { useEffect, useState } from 'react'
import type { ExportProgress, ExportSlot } from '@shared/layout'
import { mpcfillFaceKey } from '@shared/mpcfill'
import { useImageSourceStore } from '@renderer/state/imageSourceStore'
import { useDeckStore } from '@renderer/state/deckStore'
import { useDecksStore } from '@renderer/state/decksStore'
import { useOrderStore } from '@renderer/state/orderStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'
import { useCollectionStore } from '@renderer/state/collectionStore'
import { useRotateStore } from '@renderer/state/rotateStore'
import { useTextProxyStore } from '@renderer/state/textProxyStore'

type Phase = 'configure' | 'running' | 'done' | 'error'

export function ExportDialog({
  onClose,
  onEditPageSetup
}: {
  onClose: () => void
  onEditPageSetup: () => void
}): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const slots = useOrderStore((state) => state.slots)
  const syncFromDeck = useOrderStore((state) => state.syncFromDeck)
  const upscaledSet = useUpscaleStore((state) => state.upscaled)
  const options = usePageSetupStore((state) => state.options)
  const collection = useCollectionStore()
  const rotated = useRotateStore((state) => state.rotated)
  const proxies = useTextProxyStore((state) => state.proxies)
  const mpcfillSelections = useImageSourceStore((state) => state.selections)
  // The active deck's name, used as the default export filename.
  const deckName = useDecksStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeId)?.name
  )
  const [phase, setPhase] = useState<Phase>('configure')
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [message, setMessage] = useState<string>('')

  const duplex = options.cardBack !== 'none'
  // Stable signature of the deck's quantities + duplex (which pairs DFC faces);
  // rebuilds the order only when one changes.
  const deckSignature =
    items.map((item) => `${item.card.id}:${item.quantities.join(',')}`).join('|') + `|${duplex}`

  useEffect(() => {
    syncFromDeck(items, duplex)
    // The deck signature captures everything syncFromDeck reads; items/syncFromDeck are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckSignature])

  useEffect(() => {
    const unsubscribe = window.phoxx.onExportProgress(setProgress)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && phase !== 'running') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, phase])

  // Cards to skip because you own them (unless you've forced "print anyway").
  const skipIds = new Set(
    collection.skipOwned
      ? items
          .filter(
            (item) => collection.isOwned(item.card.name) && !collection.forcePrint[item.card.id]
          )
          .map((item) => item.card.id)
      : []
  )

  const exportSlots: ExportSlot[] = slots
    .filter((slot) => slot.spacer || !skipIds.has(slot.cardId))
    .map((slot) =>
      slot.spacer
        ? { cardId: '', faceIndex: 0, upscale: false, spacer: true }
        : {
            cardId: slot.cardId,
            faceIndex: slot.faceIndex,
            upscale: Boolean(upscaledSet[slot.cardId]),
            rotate: Boolean(rotated[slot.cardId]),
            textProxy: Boolean(proxies[slot.cardId]),
            mpcfillIdentifier:
              mpcfillSelections[mpcfillFaceKey(slot.cardId, slot.faceIndex)]?.identifier
          }
    )
  const totalCards = exportSlots.length
  const skippedCount = slots.length - exportSlots.length
  const upscaledCount = items.filter((item) => upscaledSet[item.card.id]).length

  const runGuarded = async (action: () => Promise<string | null>): Promise<void> => {
    setPhase('running')
    setProgress(null)
    try {
      const result = await action()
      if (result === null) {
        setPhase('configure')
        return
      }
      setMessage(result)
      setPhase('done')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export failed')
      setPhase('error')
    }
  }

  const exportPdf = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportPdf({
        slots: exportSlots,
        options,
        ...(deckName ? { name: deckName } : {})
      })
      if (outcome.canceled) return null
      const spread =
        outcome.fileCount > 1
          ? `${outcome.pageCount} page(s) across ${outcome.fileCount} files`
          : `${outcome.pageCount} page(s)`
      return `Saved ${outcome.cardCount} cards (${spread}) to ${outcome.path}`
    })

  const printDeck = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.printPdf({ slots: exportSlots, options })
      return outcome.canceled ? null : `Sent ${outcome.cardCount} cards to the printer`
    })

  const exportImages = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportImages(exportSlots)
      return outcome.canceled ? null : `Saved ${outcome.count} card image(s) to ${outcome.path}`
    })

  // Export just the first card so the user can dial in scale/colour on one sheet
  // before committing a full run.
  const exportTestCard = (): Promise<void> =>
    runGuarded(async () => {
      const first = exportSlots[0]
      if (!first) return null
      const testName = [deckName, 'test card'].filter(Boolean).join(' ')
      const outcome = await window.phoxx.exportPdf({ slots: [first], options, name: testName })
      return outcome.canceled ? null : `Saved a 1-card test sheet to ${outcome.path}`
    })

  const exportZip = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportZip(exportSlots, deckName)
      return outcome.canceled ? null : `Saved ${outcome.count} card image(s) to ${outcome.path}`
    })

  // One physical card per deck card; double-faced cards pair front + back, so the
  // front-face quantity drives the copy count.
  const mpcCards = items
    .filter((item) => item.section !== 'maybeboard' && !skipIds.has(item.card.id))
    .map((item) => ({
      cardId: item.card.id,
      quantity: item.quantities[0] ?? 0,
      upscale: Boolean(upscaledSet[item.card.id])
    }))
    .filter((card) => card.quantity > 0)

  const exportMpc = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportMpc(mpcCards)
      return outcome.canceled
        ? null
        : `Saved an MPC order of ${outcome.cardCount} card(s) (${outcome.fileCount} files) to ${outcome.path}`
    })

  const exportCalibration = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportCalibration(options)
      return outcome.canceled ? null : `Saved calibration page to ${outcome.path}`
    })

  const exportCutFile = (): Promise<void> =>
    runGuarded(async () => {
      const outcome = await window.phoxx.exportCutFile(options)
      return outcome.canceled ? null : `Saved cut file to ${outcome.path}`
    })

  const running = phase === 'running'

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Export">
      <button
        className="detail__backdrop"
        type="button"
        aria-label="Close"
        onClick={() => !running && onClose()}
      />
      <div className="detail__panel import">
        {!running && (
          <button className="detail__close" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        <h2 className="detail__name">Export</h2>

        {phase === 'done' || phase === 'error' ? (
          <>
            <p className={phase === 'error' ? 'export__error' : 'detail__hint'}>{message}</p>
            <div className="import__actions">
              <button className="search__button" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="detail__hint">
              {totalCards} card image(s) · {options.pageSize.toUpperCase()} {options.orientation}
              {options.bleedMm > 0 ? ` · ${options.bleedMm}mm bleed` : ''}
              {options.cardBack !== 'none' ? ' · card backs (duplex)' : ''}.{' '}
              <button type="button" className="linklike" onClick={onEditPageSetup}>
                Edit page setup
              </button>
            </p>
            {skippedCount > 0 && (
              <p className="detail__hint">
                {skippedCount} card image(s) skipped because you own them (toggle individual cards
                in the deck to print anyway).
              </p>
            )}
            <p className="detail__hint">
              {upscaledCount === 0
                ? 'All cards export at original quality (use the Upscale buttons first).'
                : `${upscaledCount} of ${items.length} card type(s) will export upscaled; the rest stay original.`}
            </p>

            {running && (
              <p className="detail__hint">
                {progress?.phase === 'rendering'
                  ? 'Rendering…'
                  : `Preparing ${progress?.completed ?? 0}/${progress?.total ?? totalCards}…`}
              </p>
            )}

            <div className="import__actions export__buttons">
              <button
                className="toggle"
                type="button"
                disabled={running}
                onClick={() => void exportCalibration()}
              >
                Calibration page
              </button>
              <button
                className="toggle"
                type="button"
                disabled={running}
                onClick={() => void exportCutFile()}
                title="SVG cut paths + registration marks for a Cricut/Silhouette or guillotine"
              >
                Cut file (SVG)
              </button>
              <button
                className="toggle"
                type="button"
                disabled={running || items.length === 0}
                onClick={() => void exportTestCard()}
                title="Export just the first card to test scale and colour on one sheet"
              >
                Test card
              </button>
              <button
                className="toggle"
                type="button"
                disabled={running || items.length === 0}
                onClick={() => void exportImages()}
              >
                Export images
              </button>
              <button
                className="toggle"
                type="button"
                disabled={running || items.length === 0}
                onClick={() => void exportZip()}
                title="Bundle every card image (upscaled or source) into one ZIP file"
              >
                Export ZIP
              </button>
              <button
                className="toggle"
                type="button"
                disabled={running || mpcCards.length === 0}
                onClick={() => void exportMpc()}
                title="Full-bleed images + order.xml for MakePlayingCards (MPC Autofill)"
              >
                Export for MPC
              </button>
              <button
                className="search__button"
                type="button"
                disabled={running || items.length === 0}
                onClick={() => void exportPdf()}
              >
                {running ? 'Exporting…' : 'Export PDF'}
              </button>
              <button
                className="search__button"
                type="button"
                disabled={running || items.length === 0}
                onClick={() => void printDeck()}
                title="Send the proxy sheet straight to a printer"
              >
                {running ? 'Working…' : 'Print'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
