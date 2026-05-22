import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EXPORT_OPTIONS, type ExportProgress } from '@shared/layout'
import type { Card } from '@shared/scryfall'
import { ExportService } from './service'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

function card(id: string, faceCount: number): Card {
  return {
    id,
    oracleId: 'o',
    name: id,
    setCode: 'tst',
    collectorNumber: '1',
    lang: 'en',
    layout: faceCount > 1 ? 'transform' : 'normal',
    faces: Array.from({ length: faceCount }, (_unused, index) => ({
      name: `${id}-${index}`,
      imageUrl: `https://img/${id}-${index}.png`
    })),
    prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null }
  }
}

describe('ExportService.export', () => {
  let dir: string
  let imagePath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-export-'))
    imagePath = join(dir, 'face.png')
    await writeFile(imagePath, PNG_1X1)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('dedupes image prep over the given slots and writes a valid PDF', async () => {
    const cards: Record<string, Card> = { single: card('single', 1), dfc: card('dfc', 2) }
    const ensureImage = vi.fn(async () => imagePath)
    const events: ExportProgress[] = []

    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage,
      emit: (progress) => events.push(progress)
    })

    const savePath = join(dir, 'out.pdf')
    // 2× single face + double-faced front + back = 4 card slots.
    const result = await service.export(
      [
        { cardId: 'single', faceIndex: 0, upscale: true },
        { cardId: 'single', faceIndex: 0, upscale: true },
        { cardId: 'dfc', faceIndex: 0, upscale: false },
        { cardId: 'dfc', faceIndex: 1, upscale: false }
      ],
      DEFAULT_EXPORT_OPTIONS,
      savePath
    )

    expect(result.cardCount).toBe(4)
    expect(result.pageCount).toBe(1)
    expect(result.path).toBe(savePath)

    // Three unique faces (single/0, dfc/0, dfc/1) → image prepared three times only.
    expect(ensureImage).toHaveBeenCalledTimes(3)
    // The per-slot flag is forwarded: single is upscaled, dfc is not.
    expect(ensureImage).toHaveBeenCalledWith('single', 0, true)
    expect(ensureImage).toHaveBeenCalledWith('dfc', 1, false)
    expect(events.at(-1)).toEqual({ phase: 'done', completed: 4, total: 4 })

    const doc = await PDFDocument.load(await readFile(savePath))
    expect(doc.getPageCount()).toBe(1)
  })

  it('prints slots in the given order across pages', async () => {
    const cards: Record<string, Card> = { a: card('a', 1), b: card('b', 1), c: card('c', 1) }
    const ensureImage = vi.fn(async (_cardId: string, _faceIndex: number, _upscale: boolean) =>
      Promise.resolve(imagePath)
    )

    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage,
      emit: () => {}
    })

    const savePath = join(dir, 'ordered.pdf')
    // A deliberate, non-sorted order; each card is unique so prep order tracks input order.
    const result = await service.export(
      [
        { cardId: 'c', faceIndex: 0, upscale: false },
        { cardId: 'a', faceIndex: 0, upscale: false },
        { cardId: 'b', faceIndex: 0, upscale: false }
      ],
      DEFAULT_EXPORT_OPTIONS,
      savePath
    )

    expect(result.cardCount).toBe(3)
    // Unique images are prepared in the order the slots first appear.
    const order = ensureImage.mock.calls.map(([cardId]) => cardId)
    expect(order).toEqual(['c', 'a', 'b'])

    const doc = await PDFDocument.load(await readFile(savePath))
    expect(doc.getPageCount()).toBe(result.pageCount)
  })

  it('exports each unique face as a PNG named by set, number, and card name', async () => {
    const cards: Record<string, Card> = { single: card('single', 1), dfc: card('dfc', 2) }
    const outDir = join(dir, 'images')
    await mkdir(outDir)

    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage: async () => imagePath,
      emit: () => {}
    })

    const result = await service.exportImages(
      [
        { cardId: 'single', faceIndex: 0, upscale: false },
        { cardId: 'dfc', faceIndex: 0, upscale: false },
        { cardId: 'dfc', faceIndex: 1, upscale: false }
      ],
      outDir
    )

    // Unique faces only: single (1) + dfc (2) = 3, regardless of repeats.
    expect(result.count).toBe(3)
    const files = (await readdir(outDir)).sort()
    expect(files).toEqual(['tst-1-dfc-1.png', 'tst-1-dfc-2.png', 'tst-1-single.png'])
  })

  it('prints only the faces present in the slots', async () => {
    const cards: Record<string, Card> = { dfc: card('dfc', 2) }
    const ensureImage = vi.fn(async () => imagePath)
    const events: ExportProgress[] = []

    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage,
      emit: (progress) => events.push(progress)
    })

    const savePath = join(dir, 'out.pdf')
    // Only the front face is printed (2 copies); the back face is absent.
    const result = await service.export(
      [
        { cardId: 'dfc', faceIndex: 0, upscale: false },
        { cardId: 'dfc', faceIndex: 0, upscale: false }
      ],
      DEFAULT_EXPORT_OPTIONS,
      savePath
    )

    expect(result.cardCount).toBe(2)
    expect(ensureImage).toHaveBeenCalledWith('dfc', 0, false)
    expect(ensureImage).not.toHaveBeenCalledWith('dfc', 1, false)
  })
})
