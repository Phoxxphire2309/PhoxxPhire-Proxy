import { computeDeckStats, type ManaColor } from '@shared/deckStats'
import { formatUsd } from '@shared/scryfall'
import { useDeckStore } from '@renderer/state/deckStore'

const COLOR_META: { key: ManaColor; label: string; swatch: string }[] = [
  { key: 'W', label: 'White', swatch: '#f3e9c6' },
  { key: 'U', label: 'Blue', swatch: '#3b82f6' },
  { key: 'B', label: 'Black', swatch: '#5b5563' },
  { key: 'R', label: 'Red', swatch: '#ef4444' },
  { key: 'G', label: 'Green', swatch: '#22a55b' },
  { key: 'C', label: 'Colourless', swatch: '#9aa0aa' }
]

/** Mana curve, colour, and type breakdown for the current deck. */
export function DeckStats(): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  // Stats describe the actual deck: skip the maybeboard (a holding area) and
  // tokens/emblems (not real deck cards).
  const stats = computeDeckStats(
    items
      .filter(
        (item) => item.section !== 'maybeboard' && !/Token|Emblem/.test(item.card.typeLine ?? '')
      )
      .map((item) => ({ card: item.card, count: item.quantities[0] ?? 0 }))
  )
  const curveMax = Math.max(1, ...stats.curve)
  const types = Object.entries(stats.types).sort((a, b) => b[1] - a[1])

  return (
    <div className="stats">
      <div className="stats__row">
        <span className="stats__total">{stats.total} cards</span>
        <span className="stats__total">{stats.lands} lands</span>
        <span className="stats__total">{formatUsd(stats.value)}</span>
      </div>

      <h4 className="stats__heading">Mana curve (non-land)</h4>
      <div className="stats__curve">
        {stats.curve.map((count, cmc) => (
          <div className="stats__bar" key={cmc}>
            <span className="stats__barcount">{count || ''}</span>
            <div
              className="stats__barfill"
              style={{ height: `${(count / curveMax) * 100}%` }}
              aria-hidden="true"
            />
            <span className="stats__barlabel">{cmc === 7 ? '7+' : cmc}</span>
          </div>
        ))}
      </div>

      <h4 className="stats__heading">Colours</h4>
      <div className="stats__colors">
        {COLOR_META.filter((c) => stats.colors[c.key] > 0).map((c) => (
          <span className="stats__color" key={c.key} title={c.label}>
            <span className="stats__swatch" style={{ background: c.swatch }} aria-hidden="true" />
            {stats.colors[c.key]}
          </span>
        ))}
      </div>

      {types.length > 0 && (
        <>
          <h4 className="stats__heading">Types</h4>
          <ul className="stats__types">
            {types.map(([type, count]) => (
              <li key={type}>
                <span>{type}</span>
                <span className="stats__typecount">{count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
