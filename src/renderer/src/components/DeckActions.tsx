import { useDeckStore, type BulkPrintingMode } from '@renderer/state/deckStore'
import { useDeckUiStore } from '@renderer/state/deckUiStore'
import { useUpscaleStore } from '@renderer/state/upscaleStore'
import { preUpscaleDeckWithConfirm } from '@renderer/state/upscaleActions'
import { confirm } from '@renderer/state/confirmStore'
import { DeckStats } from '@renderer/components/DeckStats'
import { DeckHealth } from '@renderer/components/DeckHealth'

/** One uniform action row: icon badge, label, and a trailing affordance. */
function Row({
  icon,
  label,
  onClick,
  disabled,
  chevron = '›'
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
  chevron?: string
}): React.JSX.Element {
  return (
    <button className="deck__navrow" type="button" onClick={onClick} disabled={disabled}>
      <span className="deck__navicon" aria-hidden="true">
        {icon}
      </span>
      <span className="deck__navlabel">{label}</span>
      <span className="deck__navchev" aria-hidden="true">
        {chevron}
      </span>
    </button>
  )
}

/** Decks view right panel: stats breakdown plus the print/export/upscale actions. */
export function DeckActions(): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const bulkSwitchPrintings = useDeckStore((state) => state.bulkSwitchPrintings)
  const bulkRunning = useDeckStore((state) => state.bulkRunning)
  const upscalerAvailable = useUpscaleStore((state) => state.available) === true
  const open = useDeckUiStore((state) => state.open)

  const hasCards = items.length > 0
  const preUpscale = (): void => void preUpscaleDeckWithConfirm(items.map((item) => item.card))

  const chooseSwitch = async (): Promise<void> => {
    const mode = await confirm({
      title: 'Switch printings',
      message: 'Switch every card in the deck to its…',
      options: [
        { id: 'highres', label: 'Best scan', primary: true },
        { id: 'cheapest', label: 'Cheapest' },
        { id: 'expensive', label: 'Most expensive' },
        { id: 'newest', label: 'Newest' }
      ]
    })
    if (mode) void bulkSwitchPrintings(mode as BulkPrintingMode)
  }

  if (!hasCards) {
    return (
      <div className="dactions">
        <p className="deck__empty">Add cards to see stats and print options.</p>
      </div>
    )
  }

  return (
    <div className="dactions">
      <DeckHealth />
      <DeckStats />

      <button className="deck__export" type="button" onClick={() => open('export')}>
        ↓ Export PDF
      </button>

      <nav className="deck__nav dactions__nav">
        <Row icon="⎙" label="Print preview" onClick={() => open('preview')} />
        {upscalerAvailable && <Row icon="✦" label="Pre-upscale all" onClick={preUpscale} />}
        <Row
          icon="⇄"
          label={bulkRunning ? 'Switching printings…' : 'Switch printings'}
          onClick={() => void chooseSwitch()}
          disabled={bulkRunning}
        />
        <Row icon="◰" label="Print quality" onClick={() => open('quality')} />
        <Row icon="♠" label="Sample hand" onClick={() => open('sampleHand')} />
        <Row icon="⚡" label="Combos" onClick={() => open('combos')} />
        <Row icon="◈" label="Tokens" onClick={() => open('tokens')} />
        <Row icon="⬣" label="Basic lands" onClick={() => open('lands')} />
      </nav>
    </div>
  )
}
