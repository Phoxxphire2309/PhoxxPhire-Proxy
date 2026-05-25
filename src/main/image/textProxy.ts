import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
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

const nodeRequire = createRequire(import.meta.url)

/** Locate the bundled (MIT) mana-font package for its symbol SVGs + MPlantin font. */
let manaDir: string | null | undefined
function manaFontDir(): string | null {
  if (manaDir === undefined) {
    try {
      manaDir = dirname(nodeRequire.resolve('mana-font/package.json'))
    } catch {
      manaDir = null
    }
  }
  return manaDir
}

/** Scryfall cost token → mana-font svg filename. */
function glyphFile(token: string): string {
  const upper = token.toUpperCase()
  if (upper === 'T') return 'tap'
  if (upper === 'Q') return 'untap'
  return token.toLowerCase().replace(/\//g, '')
}

/** The `d` path of a mana symbol glyph (32×32 viewBox), cached; null if unavailable. */
const glyphCache = new Map<string, string | null>()
function glyphPath(token: string): string | null {
  const cached = glyphCache.get(token)
  if (cached !== undefined) return cached
  const dir = manaFontDir()
  let path: string | null = null
  if (dir) {
    try {
      const svg = readFileSync(join(dir, 'svg', `${glyphFile(token)}.svg`), 'utf8')
      path = /\bd="([^"]+)"/.exec(svg)?.[1] ?? null
    } catch {
      path = null
    }
  }
  glyphCache.set(token, path)
  return path
}

/** Embedded @font-face for MPlantin (the MTG rules-text font), or '' if unavailable. */
let fontFace: string | null | undefined
function mplantinFontFace(): string {
  if (fontFace === undefined) {
    const dir = manaFontDir()
    try {
      const ttf = readFileSync(join(dir!, 'fonts', 'mplantin.ttf')).toString('base64')
      fontFace = `@font-face{font-family:'MPlantin';src:url(data:font/ttf;base64,${ttf}) format('truetype');}`
    } catch {
      fontFace = null
    }
  }
  return fontFace ?? ''
}

const FONT_STACK = "'MPlantin', Georgia, 'Times New Roman', serif"

/** Mana disc colours by symbol; generic/other fall back to colourless grey. */
const DISC: Record<string, string> = {
  w: '#f8f3d0',
  u: '#a8dcf0',
  b: '#cabfbb',
  r: '#f7a18b',
  g: '#9ad3a6',
  c: '#cac6c0'
}
const GLYPH_INK = '#1b1714'

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

function wrapOracle(text: string, maxChars: number): string[] {
  const lines: string[] = []
  stripSymbols(text)
    .split(/\n/)
    .forEach((paragraph, index) => {
      if (index > 0) lines.push('')
      if (paragraph.trim() !== '') lines.push(...wrapLine(paragraph.trim(), maxChars))
    })
  return lines
}

/** Mana cost as right-aligned pips (coloured disc + real symbol glyph) ending at `rightX`. */
function manaPips(cost: string | undefined, rightX: number, cy: number): string {
  if (!cost) return ''
  const tokens = [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)
  const r = 16
  const step = r * 2 + 5
  let x = rightX - r
  const pips: string[] = []
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i]!
    const fill = DISC[token.toLowerCase()] ?? '#cdc8c2'
    pips.push(
      `<circle cx="${x}" cy="${cy}" r="${r}" fill="${fill}" stroke="#1c1a16" stroke-width="1"/>`
    )
    const path = glyphPath(token)
    if (path) {
      const s = (r * 1.45) / 32
      pips.push(
        `<g transform="translate(${(x - 16 * s).toFixed(2)} ${(cy - 16 * s).toFixed(2)}) scale(${s.toFixed(4)})"><path d="${path}" fill="${GLYPH_INK}"/></g>`
      )
    } else {
      pips.push(
        `<text x="${x}" y="${cy + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="${GLYPH_INK}">${escapeXml(token)}</text>`
      )
    }
    x -= step
  }
  return pips.join('')
}

/**
 * Renders a clean, readable text proxy (no art) from a card face's oracle data,
 * as a print-sized PNG, using real mana-symbol glyphs and — where the SVG
 * rasteriser can load it — the MPlantin rules-text font (serif fallback).
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
        : `<text x="${textX}" y="${ruleStartY + index * lineH}" font-size="25" fill="#1c1a16">${escapeXml(line)}</text>`
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
      `<text x="${textRight - 60}" y="${inner.y + inner.h - 50}" text-anchor="middle" font-size="30" font-weight="700" fill="#1c1a16">${escapeXml(ptText)}</text>`
    : ''

  const footer = `${(face.setCode ?? '').toUpperCase()}${face.collectorNumber ? ` · #${face.collectorNumber}` : ''} · proxy`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <style>${mplantinFontFace()} text{font-family:${FONT_STACK};}</style>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#16140f"/>
    <rect x="${inner.x}" y="${inner.y}" width="${inner.w}" height="${inner.h}" rx="20" fill="#f4ecd8"/>
    <rect x="${inner.x + 12}" y="${inner.y + 12}" width="${inner.w - 24}" height="64" rx="10" fill="#efe6cd" stroke="#1c1a16" stroke-width="1.5"/>
    <text x="${textX}" y="${titleCy + 8}" font-size="32" font-weight="700" fill="#1c1a16">${escapeXml(face.name)}</text>
    ${manaPips(face.manaCost, textRight, titleCy)}
    <rect x="${inner.x + 12}" y="${typeY - 26}" width="${inner.w - 24}" height="52" rx="10" fill="#efe6cd" stroke="#1c1a16" stroke-width="1.5"/>
    <text x="${textX}" y="${typeY + 8}" font-size="25" font-weight="600" fill="#1c1a16">${escapeXml(face.typeLine ?? '')}</text>
    ${ruleTspans}
    ${ptBox}
    <text x="${textX}" y="${inner.y + inner.h - 16}" font-size="16" fill="#6b6453">${escapeXml(footer)}</text>
  </svg>`

  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  return new Uint8Array(png)
}
