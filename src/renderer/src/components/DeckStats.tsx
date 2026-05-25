import { useState } from 'react'
import { computeDeckStats, type ManaColor } from '@shared/deckStats'
import { bestUsd, formatUsd } from '@shared/scryfall'
import {
  DECK_SECTIONS,
  DECK_SECTION_LABELS,
  isPrintableSection,
  type DeckSection
} from '@shared/deck'
import {
  DECK_FORMATS,
  DECK_FORMAT_LABELS,
  isIllegal,
  legalityIn,
  type DeckFormat
} from '@shared/legality'
import { useDeckStore } from '@renderer/state/deckStore'

const COLOR_META: { key: ManaColor; label: string }[] = [
  { key: 'W', label: 'White' },
  { key: 'U', label: 'Blue' },
  { key: 'B', label: 'Black' },
  { key: 'R', label: 'Red' },
  { key: 'G', label: 'Green' },
  { key: 'C', label: 'Colourless' }
]

const isRealCard = (typeLine: string | undefined): boolean => !/Token|Emblem/.test(typeLine ?? '')

/** Mana curve, colour, type, price-by-section, and format-legality breakdown. */
export function DeckStats(): React.JSX.Element {
  const items = useDeckStore((state) => state.items)
  const [format, setFormat] = useState<DeckFormat>('commander')

  // Stats describe the actual deck: skip the maybeboard (a holding area) and
  // tokens/emblems (not real deck cards).
  const deckItems = items.filter(
    (item) => item.section !== 'maybeboard' && isRealCard(item.card.typeLine)
  )
  const stats = computeDeckStats(
    deckItems.map((item) => ({ card: item.card, count: item.quantities[0] ?? 0 }))
  )
  const curveMax = Math.max(1, ...stats.curve)
  const types = Object.entries(stats.types).sort((a, b) => b[1] - a[1])

  // Price per section (real cards only), in display order, non-empty sections.
  const sectionValues = DECK_SECTIONS.map((section) => {
    const value = items
      .filter((item) => item.section === section && isRealCard(item.card.typeLine))
      .reduce((sum, item) => sum + (bestUsd(item.card.prices) ?? 0) * (item.quantities[0] ?? 0), 0)
    const count = items
      .filter((item) => item.section === section && isRealCard(item.card.typeLine))
      .reduce((sum, item) => sum + (item.quantities[0] ?? 0), 0)
    return { section, value, count }
  }).filter((row) => row.count > 0)
  const showSectionBreakdown = sectionValues.length > 1

  // Cards not legal in the chosen format (printable, real cards). 'unknown' =
  // no legality data yet (e.g. a card cached before this existed) — not flagged.
  const illegal = items
    .filter((item) => isPrintableSection(item.section) && isRealCard(item.card.typeLine))
    .filter((item) => isIllegal(legalityIn(item.card, format)))
    .map((item) => ({ name: item.card.name, status: legalityIn(item.card, format) }))

  return (
    <div className="stats">
      <div className="stats__row">
        <span className="stats__total">{stats.total} cards</span>
        <span className="stats__total">{stats.lands} lands</span>
        <span className="stats__total">{formatUsd(stats.value)}</span>
      </div>

      {showSectionBreakdown && (
        <>
          <h4 className="stats__heading">Price by section</h4>
          <ul className="stats__types">
            {sectionValues.map((row) => (
              <li key={row.section}>
                <span>
                  {DECK_SECTION_LABELS[row.section as DeckSection]}{' '}
                  <span className="stats__typecount">{row.count}</span>
                </span>
                <span className="stats__typecount">{formatUsd(row.value)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="stats__heading">Format legality</h4>
      <div className="stats__legality">
        <select
          className="ditem__section"
          value={format}
          onChange={(event) => setFormat(event.target.value as DeckFormat)}
          aria-label="Format to check legality against"
        >
          {DECK_FORMATS.map((value) => (
            <option key={value} value={value}>
              {DECK_FORMAT_LABELS[value]}
            </option>
          ))}
        </select>
        {illegal.length === 0 ? (
          <span className="stats__legal-ok">✓ no problems</span>
        ) : (
          <span className="stats__legal-bad">
            {illegal.length} not legal in {DECK_FORMAT_LABELS[format]}
          </span>
        )}
      </div>
      {illegal.length > 0 && (
        <ul className="stats__illegal">
          {illegal.map((card) => (
            <li key={card.name}>
              <span>{card.name}</span>
              <span className="stats__legal-bad">{card.status.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      )}

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
            <i className={`ms ms-${c.key.toLowerCase()} ms-cost`} aria-hidden="true" />
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
