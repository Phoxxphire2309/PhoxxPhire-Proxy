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

  it('expands quantity × faces, dedupes image prep, and writes a valid PDF', async () => {
    const cards: Record<string, Card> = { single: card('single', 1), dfc: card('dfc', 2) }
    const ensureImage = vi.fn(async () => imagePath)
    const events: ExportProgress[] = []

    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage,
      emit: (progress) => events.push(progress)
    })

    const savePath = join(dir, 'out.pdf')
    // 2× single face + 1× double-faced (2 faces) = 2 + 2 = 4 card slots.
    const result = await service.export(
      [
        { id: 'single', quantity: 2 },
        { id: 'dfc', quantity: 1 }
      ],
      DEFAULT_EXPORT_OPTIONS,
      savePath
    )

    expect(result.cardCount).toBe(4)
    expect(result.pageCount).toBe(1)
    expect(result.path).toBe(savePath)

    // Three unique faces (single/0, dfc/0, dfc/1) → image prepared three times only.
    expect(ensureImage).toHaveBeenCalledTimes(3)
    expect(events.at(-1)).toEqual({ phase: 'done', completed: 4, total: 4 })

    const doc = await PDFDocument.load(await readFile(savePath))
    expect(doc.getPageCount()).toBe(1)
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
        { id: 'single', quantity: 3 },
        { id: 'dfc', quantity: 1 }
      ],
      outDir
    )

    // Unique faces only: single (1) + dfc (2) = 3, regardless of quantity.
    expect(result.count).toBe(3)
    const files = (await readdir(outDir)).sort()
    expect(files).toEqual(['tst-1-dfc-1.png', 'tst-1-dfc-2.png', 'tst-1-single.png'])
  })
})
