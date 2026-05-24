/**
 * Decklist exporters, shared between processes. Each turns the deck into text in
 * a well-known format:
 *  - `text` — a plain `qty name` list grouped by section with `// Section`
 *    comment headers; re-importable by our own parser.
 *  - `mtga` — the MTG Arena / Moxfield form (`qty name (SET) number`) with
 *    `Commander` / `Deck` / `Sideboard` headers.
 *  - `csv`  — a spreadsheet-friendly table with per-card and total prices.
 */

import { DECK_SECTIONS, DECK_SECTION_LABELS, type DeckSection } from './deck'

export const DECKLIST_FORMATS = ['text', 'mtga', 'csv'] as const
export type DecklistFormat = (typeof DECKLIST_FORMATS)[number]

export const DECKLIST_FILE = {
  text: { label: 'Text (.txt)', extension: 'txt' },
  mtga: { label: 'MTG Arena (.txt)', extension: 'txt' },
  csv: { label: 'CSV (.csv)', extension: 'csv' }
} as const satisfies Record<DecklistFormat, { label: string; extension: string }>

export type DecklistExportOutcome = { canceled: true } | { canceled: false; path: string }

/** One deck card, decoupled from the renderer's store shape. */
export interface DecklistCard {
  name: string
  setCode: string
  collectorNumber: string
  quantity: number
  section: DeckSection
  usd: number | null
}

/** Arena section headers (also recognised by our importer). */
const MTGA_SECTION_HEADER: Record<DeckSection, string> = {
  commander: 'Commander',
  main: 'Deck',
  sideboard: 'Sideboard',
  maybeboard: 'Maybeboard'
}

/** Sections that actually contain cards, in display order. */
function usedSections(cards: DecklistCard[]): DeckSection[] {
  return DECK_SECTIONS.filter((section) => cards.some((card) => card.section === section))
}

function formatText(cards: DecklistCard[]): string {
  const sections = usedSections(cards)
  const showHeaders = sections.length > 1
  const blocks = sections.map((section) => {
    const lines = cards
      .filter((card) => card.section === section)
      .map((card) => `${card.quantity} ${card.name}`)
    return showHeaders
      ? [`// ${DECK_SECTION_LABELS[section]}`, ...lines].join('\n')
      : lines.join('\n')
  })
  return blocks.join('\n\n')
}

function formatMtga(cards: DecklistCard[]): string {
  const blocks = usedSections(cards).map((section) => {
    const lines = cards
      .filter((card) => card.section === section)
      .map(
        (card) =>
          `${card.quantity} ${card.name} (${card.setCode.toUpperCase()}) ${card.collectorNumber}`
      )
    return [MTGA_SECTION_HEADER[section], ...lines].join('\n')
  })
  return blocks.join('\n\n')
}

/** Quotes a CSV field when it contains a comma, quote, or newline. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function formatCsv(cards: DecklistCard[]): string {
  const header = [
    'Quantity',
    'Name',
    'Set',
    'Collector Number',
    'Section',
    'Unit Price (USD)',
    'Total (USD)'
  ]
  const rows = cards.map((card) => {
    const unit = card.usd
    const total = unit === null ? '' : (unit * card.quantity).toFixed(2)
    return [
      String(card.quantity),
      card.name,
      card.setCode.toUpperCase(),
      card.collectorNumber,
      DECK_SECTION_LABELS[card.section],
      unit === null ? '' : unit.toFixed(2),
      total
    ]
      .map(csvField)
      .join(',')
  })
  return [header.map(csvField).join(','), ...rows].join('\n')
}

/** Renders the deck to the requested decklist format. */
export function formatDecklist(cards: DecklistCard[], format: DecklistFormat): string {
  switch (format) {
    case 'mtga':
      return formatMtga(cards)
    case 'csv':
      return formatCsv(cards)
    default:
      return formatText(cards)
  }
}
