import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
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
    prices: { usd: null, usdFoil: null, usdEtched: null, eur: null, eurFoil: null, tix: null },
    relatedTokens: []
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

describe('ExportService.exportMpc', () => {
  let dir: string
  let imagePath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-mpc-'))
    imagePath = join(dir, 'face.png')
    await writeFile(imagePath, PNG_1X1)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function mpcService(cards: Record<string, Card>): ExportService {
    return new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage: async () => imagePath,
      // Identity transforms keep the test off the real sharp pipeline.
      mpcImage: async (bytes) => bytes,
      mpcCardBack: async () => new Uint8Array([1, 2, 3]),
      emit: () => {}
    })
  }

  it('throws a clear error when the MPC deps are not configured', async () => {
    const service = new ExportService({
      resolveCard: async () => card('a', 1),
      ensureImage: async () => imagePath,
      emit: () => {}
    })
    await expect(
      service.exportMpc([{ cardId: 'a', quantity: 1, upscale: false }], dir)
    ).rejects.toThrow(/not configured/)
  })

  it('writes a front image, a card back, an order.xml, and pairs DFC backs', async () => {
    const cards: Record<string, Card> = { single: card('single', 1), dfc: card('dfc', 2) }
    const outDir = join(dir, 'order')
    await mkdir(outDir)

    const result = await mpcService(cards).exportMpc(
      [
        { cardId: 'single', quantity: 2, upscale: false },
        { cardId: 'dfc', quantity: 1, upscale: false }
      ],
      outDir
    )

    // 2 single copies + 1 dfc copy = 3 physical cards.
    expect(result.cardCount).toBe(3)
    // single front + dfc front + dfc back + cardback = 4 files (+ order.xml).
    expect(result.fileCount).toBe(4)

    const files = (await readdir(outDir)).sort()
    expect(files).toContain('order.xml')
    expect(files).toContain('tst-1-single.png')
    expect(files).toContain('tst-1-dfc.png')
    expect(files).toContain('tst-1-dfc-back.png')

    const xml = await readFile(join(outDir, 'order.xml'), 'utf8')
    expect(xml).toContain('<quantity>3</quantity>')
    // The single card's two copies occupy two consecutive slots.
    expect(xml).toContain('<slots>0,1</slots>')
    // The DFC front+back share the DFC's single slot (index 2).
    const backs = xml.slice(xml.indexOf('<backs>'), xml.indexOf('</backs>'))
    expect(backs).toContain('tst-1-dfc-back.png')
    expect(backs).toContain('<slots>2</slots>')
  })

  it('skips cards with zero quantity', async () => {
    const cards: Record<string, Card> = { a: card('a', 1), b: card('b', 1) }
    const outDir = join(dir, 'order2')
    await mkdir(outDir)

    const result = await mpcService(cards).exportMpc(
      [
        { cardId: 'a', quantity: 0, upscale: false },
        { cardId: 'b', quantity: 1, upscale: false }
      ],
      outDir
    )

    expect(result.cardCount).toBe(1)
    const xml = await readFile(join(outDir, 'order.xml'), 'utf8')
    expect(xml).not.toContain('tst-1-a.png')
    expect(xml).toContain('tst-1-b.png')
  })
})

describe('ExportService.exportZip', () => {
  let dir: string
  let pngPath: string
  let jpgPath: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'phoxx-zip-'))
    pngPath = join(dir, 'src.png')
    jpgPath = join(dir, 'up.jpg')
    await writeFile(pngPath, PNG_1X1)
    // A real 1-byte-ish JPEG so the magic-number extension check exercises both paths.
    await writeFile(jpgPath, await sharp(PNG_1X1).jpeg().toBuffer())
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('zips each unique face with an extension matching its bytes (jpg vs png)', async () => {
    const cards: Record<string, Card> = { single: card('single', 1), dfc: card('dfc', 2) }
    const captured: Record<string, Uint8Array> = {}
    const savePath = join(dir, 'out.zip')

    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      // Upscaled faces resolve to the JPEG, source faces to the PNG.
      ensureImage: async (_id, _face, useUpscaled) => (useUpscaled ? jpgPath : pngPath),
      zip: (files) => {
        Object.assign(captured, files)
        return new Uint8Array([0x50, 0x4b, 0x05, 0x06]) // sentinel "PK" bytes
      },
      emit: () => {}
    })

    const result = await service.exportZip(
      [
        { cardId: 'single', faceIndex: 0, upscale: true }, // → .jpg
        { cardId: 'dfc', faceIndex: 0, upscale: false }, // → .png
        { cardId: 'dfc', faceIndex: 1, upscale: false } // → .png (face 2)
      ],
      savePath
    )

    expect(result.count).toBe(3)
    expect(Object.keys(captured).sort()).toEqual([
      'tst-1-dfc-1.png',
      'tst-1-dfc-2.png',
      'tst-1-single.jpg'
    ])
    // The zipper output is what gets written to disk.
    expect(new Uint8Array(await readFile(savePath))).toEqual(
      new Uint8Array([0x50, 0x4b, 0x05, 0x06])
    )
  })

  it('squares transparent rounded corners of source images before zipping', async () => {
    // A red image with a transparent top-left corner (like a Scryfall card PNG).
    const W = 200
    const H = 280
    const raw = Buffer.alloc(W * H * 4)
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = (y * W + x) * 4
        raw[i] = 200
        raw[i + 1] = 30
        raw[i + 2] = 30
        raw[i + 3] = x < 12 && y < 12 ? 0 : 255 // transparent corner
      }
    }
    const cornerPng = join(dir, 'corner.png')
    await writeFile(
      cornerPng,
      await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
        .png()
        .toBuffer()
    )

    const cards: Record<string, Card> = { c: card('c', 1) }
    const captured: Record<string, Uint8Array> = {}
    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage: async () => cornerPng,
      zip: (files) => {
        Object.assign(captured, files)
        return new Uint8Array([0])
      },
      emit: () => {}
    })

    await service.exportZip([{ cardId: 'c', faceIndex: 0, upscale: false }], join(dir, 'sq.zip'))

    const out = Object.values(captured)[0]!
    const meta = await sharp(out).metadata()
    expect(meta.hasAlpha).toBe(false) // squared & flattened — no transparent corners
    // The (former) transparent corner now carries the card's red edge colour.
    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    expect(data[0]!).toBeGreaterThan(120)
    expect(data[0]!).toBeGreaterThan(data[1]! + data[2]!)
  })

  it('de-duplicates identical file names with a numeric suffix', async () => {
    // Two distinct cards that sanitize to the same stem must not collide.
    const cards: Record<string, Card> = {
      a: { ...card('a', 1), setCode: 'tst', collectorNumber: '1', name: 'Bolt' },
      b: { ...card('b', 1), setCode: 'tst', collectorNumber: '1', name: 'Bolt' }
    }
    const captured: Record<string, Uint8Array> = {}

    const service = new ExportService({
      resolveCard: async (id) => cards[id]!,
      ensureImage: async () => pngPath,
      zip: (files) => {
        Object.assign(captured, files)
        return new Uint8Array([0])
      },
      emit: () => {}
    })

    await service.exportZip(
      [
        { cardId: 'a', faceIndex: 0, upscale: false },
        { cardId: 'b', faceIndex: 0, upscale: false }
      ],
      join(dir, 'dup.zip')
    )

    expect(Object.keys(captured).sort()).toEqual(['tst-1-Bolt-2.png', 'tst-1-Bolt.png'])
  })
})
