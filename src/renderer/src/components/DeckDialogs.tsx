import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { ImportDialog } from '@renderer/components/ImportDialog'
import { TokenDialog } from '@renderer/components/TokenDialog'
import { BasicLandDialog } from '@renderer/components/BasicLandDialog'
import { CollectionDialog } from '@renderer/components/CollectionDialog'
import { ExportDialog } from '@renderer/components/ExportDialog'
import { PrintPreview } from '@renderer/components/PrintPreview'
import { PageSetup } from '@renderer/components/PageSetup'
import { SampleHand } from '@renderer/components/SampleHand'
import { ComboDialog } from '@renderer/components/ComboDialog'

/** Renders whichever deck modal is currently open (driven by the deck-ui store). */
export function DeckDialogs(): React.JSX.Element {
  const modal = useDeckUiStore((state) => state.modal)
  const open = useDeckUiStore((state) => state.open)
  const close = useDeckUiStore((state) => state.close)

  return (
    <>
      {modal === 'import' && <ImportDialog onClose={close} />}
      {modal === 'tokens' && <TokenDialog onClose={close} />}
      {modal === 'lands' && <BasicLandDialog onClose={close} />}
      {modal === 'collection' && <CollectionDialog onClose={close} />}
      {modal === 'export' && (
        <ExportDialog onClose={close} onEditPageSetup={() => open('pageSetup')} />
      )}
      {modal === 'preview' && <PrintPreview onClose={close} />}
      {modal === 'pageSetup' && <PageSetup onClose={close} />}
      {modal === 'sampleHand' && <SampleHand onClose={close} />}
      {modal === 'combos' && <ComboDialog onClose={close} />}
    </>
  )
}
