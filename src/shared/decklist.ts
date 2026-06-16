/**
 * Decklist parsing + deck resolution types, shared between processes.
 *
 * The parser is intentionally forgiving: it accepts plain lists (`4 Lightning
 * Bolt`), the `x` quantity form (`4x Lightning Bolt`), and the MTG Arena /
 * Moxfield form with set + collector number (`4 Lightning Bolt (M21) 159`).
 */

import type { Card } from './scryfall'

export interface DeckLine {
  quantity: number
  name: string
  setCode?: string
  collectorNumber?: string
}

export interface DeckResolvedItem {
  card: Card
  quantity: number
}

export interface DeckResolution {
  items: DeckResolvedItem[]
  /** Human-readable messages for lines that could not be resolved. */
  errors: string[]
}

/** Per-line progress while a decklist is resolved against Scryfall. */
export interface ImportProgress {
  completed: number
  total: number
  name: string
}

/** Section headers emitted by various exporters; ignored when on their own line. */
const SECTION_HEADERS = new Set([
  'deck',
  'sideboard',
  'commander',
  'companion',
  'maybeboard',
  'about'
])

// qty (optional) | name (lazy) | optional "(SET) NUMBER" suffix.
// Covers plain lists, MTG Arena / Moxfield, MTGO, and TappedOut.
const LINE_RE = /^(?:(\d+)\s*[xX]?\s+)?(.+?)(?:\s+\(([0-9A-Za-z]+)\)(?:\s+([0-9A-Za-z-]+))?)?$/

// qty | "[SET]" or "[SET:NUMBER]" | name. Covers Magic Workstation (.mwDeck),
// Cockatrice, and XMage, which put the set in square brackets before the name.
const BRACKET_RE = /^(\d+)\s+\[([0-9A-Za-z]*)(?::([0-9A-Za-z-]+))?\]\s+(.+)$/

function parseLine(line: string): DeckLine | null {
  // Drop trailing foil/condition markers such as "*F*", and a leading "SB:"
  // sideboard tag (Cockatrice / XMage / Magic Workstation).
  const cleaned = line
    .replace(/\s*\*[^*]*\*\s*$/g, '')
    .replace(/^sb:\s*/i, '')
    .trim()

  const bracket = BRACKET_RE.exec(cleaned)
  if (bracket) {
    const [, qtyRaw, setRaw, numberRaw, nameRaw] = bracket
    const name = nameRaw?.trim()
    if (!name) return null
    return {
      quantity: Math.max(1, Number.parseInt(qtyRaw!, 10)),
      name,
      ...(setRaw ? { setCode: setRaw } : {}),
      ...(numberRaw ? { collectorNumber: numberRaw } : {})
    }
  }

  const match = LINE_RE.exec(cleaned)
  if (!match) return null

  const [, qtyRaw, nameRaw, setRaw, numberRaw] = match
  const name = nameRaw?.trim()
  if (!name) return null

  const quantity = qtyRaw ? Math.max(1, Number.parseInt(qtyRaw, 10)) : 1
  return {
    quantity,
    name,
    ...(setRaw ? { setCode: setRaw } : {}),
    ...(numberRaw ? { collectorNumber: numberRaw } : {})
  }
}

export function parseDecklist(text: string): DeckLine[] {
  const lines: DeckLine[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('#') || line.startsWith('//')) continue
    if (SECTION_HEADERS.has(line.toLowerCase())) continue
    const parsed = parseLine(line)
    if (parsed) lines.push(parsed)
  }
  return lines
}
