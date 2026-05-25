import sharp from 'sharp'

/** Card pixel size, matching the Scryfall PNG aspect (≈63×88mm). */
const WIDTH = 745
const HEIGHT = 1040

/** The data a text proxy needs — a subset of a card face plus print info. */
export interface ProxyFace {
  name: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
  power?: string
  toughness?: string
  loyalty?: string
  setCode?: string
  collectorNumber?: string
}

/** Fill colour for a mana/cost symbol pip. */
const MANA_FILL: Record<string, string> = {
  W: '#f6efd4',
  U: '#aadcf0',
  B: '#cbc2bf',
  R: '#f3a48f',
  G: '#9fd4a3',
  C: '#d6cfc6'
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' })[c]!
  )
}

/** Replaces Scryfall `{X}` symbols with their bare contents for readable text. */
function stripSymbols(text: string): string {
  return text.replace(/\{([^}]+)\}/g, '$1')
}

/** Greedy word-wrap to lines fitting `maxChars` (approximate, monospace-ish). */
function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line.length === 0) line = word
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Wraps multi-paragraph oracle text into display lines (blank line between paragraphs). */
function wrapOracle(text: string, maxChars: number): string[] {
  const lines: string[] = []
  const paragraphs = stripSymbols(text).split(/\n/)
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) lines.push('')
    if (paragraph.trim() === '') return
    lines.push(...wrapLine(paragraph.trim(), maxChars))
  })
  return lines
}

/** Mana cost symbols as right-aligned pips ending at `rightX`, vertically centred at `cy`. */
function manaPips(cost: string | undefined, rightX: number, cy: number): string {
  if (!cost) return ''
  const tokens = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)
  const r = 17
  const gap = 6
  const step = r * 2 + gap
  let x = rightX - r
  const pips: string[] = []
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i]!
    const fill = MANA_FILL[token] ?? '#d6cfc6'
    pips.push(
      `<circle cx="${x}" cy="${cy}" r="${r}" fill="${fill}" stroke="#1c1a16" stroke-width="1.5"/>` +
        `<text x="${x}" y="${cy + 6}" text-anchor="middle" font-size="20" font-weight="700" fill="#1c1a16">${escapeXml(token)}</text>`
    )
    x -= step
  }
  return pips.join('')
}

/**
 * Renders a clean, readable text proxy (no art) from a card face's oracle data,
 * as a print-sized PNG. Intended for cards you only need legible — basics,
 * commons, placeholders — so they print crisply at any size without a scan.
 */
export async function renderTextProxy(face: ProxyFace): Promise<Uint8Array> {
  const pad = 26
  const inner = { x: pad, y: pad, w: WIDTH - pad * 2, h: HEIGHT - pad * 2 }
  const textX = inner.x + 22
  const textRight = inner.x + inner.w - 22

  const titleCy = inner.y + 46
  const typeY = inner.y + 116
  const ruleStartY = inner.y + 168
  const lineH = 33
  const maxChars = 46

  const rules = face.oracleText ? wrapOracle(face.oracleText, maxChars) : []
  const ruleTspans = rules
    .map((line, index) =>
      line === ''
        ? ''
        : `<text x="${textX}" y="${ruleStartY + index * lineH}" font-size="25" fill="#1c1a16" font-family="Georgia, serif">${escapeXml(line)}</text>`
    )
    .join('')

  const ptText =
    face.loyalty !== undefined
      ? face.loyalty
      : face.power !== undefined && face.toughness !== undefined
        ? `${face.power}/${face.toughness}`
        : null
  const ptBox = ptText
    ? `<rect x="${textRight - 120}" y="${inner.y + inner.h - 90}" width="120" height="58" rx="10" fill="#efe6cd" stroke="#1c1a16" stroke-width="2"/>` +
      `<text x="${textRight - 60}" y="${inner.y + inner.h - 50}" text-anchor="middle" font-size="30" font-weight="700" fill="#1c1a16" font-family="Georgia, serif">${escapeXml(ptText)}</text>`
    : ''

  const footer = `${(face.setCode ?? '').toUpperCase()}${face.collectorNumber ? ` · #${face.collectorNumber}` : ''} · proxy`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#16140f"/>
    <rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" rx="20" fill="#f4ecd8"/>
    <rect x="${inner.x + 12}" y="${inner.y + 12}" width="${inner.w - 24}" height="64" rx="10" fill="#efe6cd" stroke="#1c1a16" stroke-width="1.5"/>
    <text x="${textX}" y="${titleCy + 8}" font-size="32" font-weight="700" fill="#1c1a16" font-family="Georgia, serif">${escapeXml(face.name)}</text>
    ${manaPips(face.manaCost, textRight, titleCy)}
    <rect x="${inner.x + 12}" y="${typeY - 26}" width="${inner.w - 24}" height="52" rx="10" fill="#efe6cd" stroke="#1c1a16" stroke-width="1.5"/>
    <text x="${textX}" y="${typeY + 8}" font-size="25" font-weight="600" fill="#1c1a16" font-family="Georgia, serif">${escapeXml(face.typeLine ?? '')}</text>
    ${ruleTspans}
    ${ptBox}
    <text x="${textX}" y="${inner.y + inner.h - 16}" font-size="16" fill="#6b6453" font-family="Georgia, serif">${escapeXml(footer)}</text>
  </svg>`

  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return new Uint8Array(png)
}
