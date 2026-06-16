import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { DEFAULT_EXPORT_OPTIONS } from '@shared/layout'
import { buildProxyPdf, splitPdfByPages } from './pdf'

// Zero bleed + 6mm margin yields a 3×3 (9 per page) grid on A4.
const NINE_UP = { ...DEFAULT_EXPORT_OPTIONS, bleedMm: 0, marginMm: 6 }

// A 1×1 transparent PNG — valid bytes for pdf-lib's embedPng.
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  )
)

describe('buildProxyPdf', () => {
  it('produces a single A4 page for nine cards', async () => {
    const slots = Array.from({ length: 9 }, () => 0)
    const bytes = await buildProxyPdf([PNG_1X1], slots, NINE_UP)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    const [page] = doc.getPages()
    // A4 dimensions in points.
    expect(page!.getWidth()).toBeCloseTo(595.28, 0)
    expect(page!.getHeight()).toBeCloseTo(841.89, 0)
  })

  it('paginates onto multiple pages when cards exceed one sheet', async () => {
    const slots = Array.from({ length: 10 }, () => 0)
    const bytes = await buildProxyPdf([PNG_1X1], slots, NINE_UP)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2)
  })

  it('still emits a (blank) page when there are no cards', async () => {
    const bytes = await buildProxyPdf([], [], DEFAULT_EXPORT_OPTIONS)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('interleaves a back page per front page when card backs are enabled', async () => {
    const slots = Array.from({ length: 9 }, () => 0)
    const bytes = await buildProxyPdf([PNG_1X1], slots, { ...NINE_UP, cardBack: 'plain' })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(2) // one front + one back
  })

  it('embeds JPEG images (upscaled output) as well as PNG', async () => {
    const jpg = new Uint8Array(
      await sharp({ create: { width: 4, height: 6, channels: 3, background: '#222' } })
        .jpeg()
        .toBuffer()
    )
    const bytes = await buildProxyPdf([jpg], [0, 0, 0], NINE_UP)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })

  it('renders every cut-guide style without error', async () => {
    for (const style of ['none', 'outline', 'corners'] as const) {
      const bytes = await buildProxyPdf([PNG_1X1], [0, 0], { ...NINE_UP, cutGuideStyle: style })
      const doc = await PDFDocument.load(bytes)
      expect(doc.getPageCount()).toBe(1)
    }
  })
})

describe('splitPdfByPages', () => {
  // A custom page just big enough for one card → one card per page, so a slot
  // count equals the page count (lets these tests control pages directly).
  const ONE_UP = {
    ...DEFAULT_EXPORT_OPTIONS,
    bleedMm: 0,
    pageSize: 'custom' as const,
    customWidthMm: 70,
    customHeightMm: 95,
    marginTopMm: 0,
    marginRightMm: 0,
    marginBottomMm: 0,
    marginLeftMm: 0
  }
  const fivePages = (): Promise<Uint8Array> => buildProxyPdf([PNG_1X1], [0, 0, 0, 0, 0], ONE_UP)

  it('returns the original bytes when no split is requested', async () => {
    const bytes = await fivePages()
    expect(await splitPdfByPages(bytes, 0, false)).toEqual([bytes])
  })

  it('returns the original bytes when the document already fits', async () => {
    const bytes = await fivePages()
    expect(await splitPdfByPages(bytes, 10, false)).toEqual([bytes])
  })

  it('splits into chunks of at most maxPages, preserving the total page count', async () => {
    const bytes = await fivePages()
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5)
    const parts = await splitPdfByPages(bytes, 2, false)
    expect(parts).toHaveLength(3) // 2 + 2 + 1
    const counts = await Promise.all(
      parts.map(async (p) => (await PDFDocument.load(p)).getPageCount())
    )
    expect(counts).toEqual([2, 2, 1])
  })

  it('rounds the chunk down to an even number so duplex front/back pairs stay together', async () => {
    // 3 cards with backs → 6 pages interleaved [f,b,f,b,f,b]. maxPages 3 → even 2.
    const bytes = await buildProxyPdf([PNG_1X1], [0, 0, 0], { ...ONE_UP, cardBack: 'plain' })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(6)
    const parts = await splitPdfByPages(bytes, 3, true)
    const counts = await Promise.all(
      parts.map(async (p) => (await PDFDocument.load(p)).getPageCount())
    )
    expect(counts).toEqual([2, 2, 2])
  })
})
