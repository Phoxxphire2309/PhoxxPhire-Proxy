import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  computePageLayout,
  pageCountFor,
  type ExportOptions,
  type ExportProgress,
  type ExportSlot
} from '@shared/layout'
import type { MpcCard } from '@shared/mpc'
import type { Card } from '@shared/scryfall'
import { buildMpcOrderXml, type MpcXmlCard } from './mpc'
import { buildProxyPdf } from './pdf'

export interface ExportServiceDeps {
  /** Resolve a card's metadata (from cache or Scryfall) to know its face count. */
  resolveCard: (cardId: string) => Promise<Card>
  /** Path to a face image — upscaled when `useUpscaled` is set and available, else source. */
  ensureImage: (cardId: string, faceIndex: number, useUpscaled: boolean) => Promise<string>
  /** Optionally transform image bytes (e.g. add mirrored bleed). Defaults to passthrough. */
  processImage?: (bytes: Uint8Array, options: ExportOptions) => Promise<Uint8Array>
  /** Render a face image to MPC full-bleed spec (required for `exportMpc`). */
  mpcImage?: (bytes: Uint8Array) => Promise<Uint8Array>
  /** Build the common MPC card-back image (required for `exportMpc`). */
  mpcCardBack?: () => Promise<Uint8Array>
  emit: (progress: ExportProgress) => void
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'card'
}

/**
 * Turns an ordered list of printable slots into a print-ready PDF: each slot is
 * one card face (so double-faced cards print both sides as separate proxies),
 * each unique face image is prepared once, and the PDF is written to disk in the
 * slots' given order. Whether a slot is upscaled is decided per slot (`upscale`).
 */
export class ExportService {
  constructor(private readonly deps: ExportServiceDeps) {}

  async export(
    slots: ExportSlot[],
    options: ExportOptions,
    savePath: string
  ): Promise<{ path: string; cardCount: number; pageCount: number }> {
    const slotKey = (slot: ExportSlot): string =>
      `${slot.upscale ? 'u' : 's'} ${slot.faceIndex} ${slot.cardId}`

    // Prepare each unique image (per card / face / quality) exactly once.
    const uniqueSlots = new Map<string, ExportSlot>()
    for (const slot of slots) uniqueSlots.set(slotKey(slot), slot)
    const keys = [...uniqueSlots.keys()]
    const keyToIndex = new Map(keys.map((key, index) => [key, index]))
    const uniqueImages: Uint8Array[] = []

    let completed = 0
    for (const key of keys) {
      const slot = uniqueSlots.get(key)!
      const path = await this.deps.ensureImage(slot.cardId, slot.faceIndex, slot.upscale)
      const bytes = new Uint8Array(await readFile(path))
      uniqueImages.push(
        this.deps.processImage ? await this.deps.processImage(bytes, options) : bytes
      )
      completed += 1
      this.deps.emit({ phase: 'preparing', completed, total: keys.length })
    }

    const slotImageIndices = slots.map((slot) => keyToIndex.get(slotKey(slot))!)

    this.deps.emit({ phase: 'rendering', completed: keys.length, total: keys.length })
    const pdf = await buildProxyPdf(uniqueImages, slotImageIndices, options)
    await writeFile(savePath, pdf)

    const layout = computePageLayout(options)
    this.deps.emit({ phase: 'done', completed: slots.length, total: slots.length })

    return {
      path: savePath,
      cardCount: slots.length,
      pageCount: pageCountFor(slots.length, layout.perPage)
    }
  }

  /** Exports each unique card face as its own PNG (upscaled per the slot's flag) into `folder`. */
  async exportImages(
    slots: ExportSlot[],
    folder: string
  ): Promise<{ path: string; count: number }> {
    const faces: {
      cardId: string
      faceIndex: number
      upscale: boolean
      setCode: string
      collectorNumber: string
      name: string
      multiFace: boolean
    }[] = []
    const seen = new Set<string>()

    for (const slot of slots) {
      const key = `${slot.cardId} ${slot.faceIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      const card = await this.deps.resolveCard(slot.cardId)
      faces.push({
        cardId: slot.cardId,
        faceIndex: slot.faceIndex,
        upscale: slot.upscale,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        name: card.name,
        multiFace: card.faces.length > 1
      })
    }

    let completed = 0
    for (const face of faces) {
      const source = await this.deps.ensureImage(face.cardId, face.faceIndex, face.upscale)
      const suffix = face.multiFace ? `-${face.faceIndex + 1}` : ''
      const fileName = `${sanitizeName(face.setCode)}-${sanitizeName(face.collectorNumber)}-${sanitizeName(face.name)}${suffix}.png`
      await copyFile(source, join(folder, fileName))
      completed += 1
      this.deps.emit({ phase: 'preparing', completed, total: faces.length })
    }

    this.deps.emit({ phase: 'done', completed, total: faces.length })
    return { path: folder, count: completed }
  }

  /**
   * Exports a deck as a MakePlayingCards (MPC Autofill) order into `folder`: one
   * full-bleed PNG per card face, a common card-back image, and an `order.xml`.
   * Double-faced cards become a single physical card (front + paired back);
   * single-faced cards use the common back.
   */
  async exportMpc(
    cards: MpcCard[],
    folder: string
  ): Promise<{ path: string; cardCount: number; fileCount: number }> {
    const { mpcImage, mpcCardBack } = this.deps
    if (!mpcImage || !mpcCardBack) {
      throw new Error('MPC export is not configured')
    }

    // Resolve everything up front so progress has a known denominator.
    const resolved: { entry: MpcCard; card: Card }[] = []
    for (const entry of cards) {
      if (entry.quantity > 0) {
        resolved.push({ entry, card: await this.deps.resolveCard(entry.cardId) })
      }
    }
    const total = resolved.reduce((sum, { card }) => sum + (card.faces.length > 1 ? 2 : 1), 0) + 1 // + card back

    const usedNames = new Set<string>()
    const uniqueName = (base: string): string => {
      const stem = sanitizeName(base)
      let name = `${stem}.png`
      for (let n = 2; usedNames.has(name.toLowerCase()); n += 1) name = `${stem}-${n}.png`
      usedNames.add(name.toLowerCase())
      return name
    }

    const renderFace = async (
      cardId: string,
      faceIndex: number,
      upscale: boolean,
      fileName: string
    ): Promise<void> => {
      const source = await this.deps.ensureImage(cardId, faceIndex, upscale)
      const bytes = await mpcImage(new Uint8Array(await readFile(source)))
      await writeFile(join(folder, fileName), bytes)
    }

    const xmlCards: MpcXmlCard[] = []
    let slot = 0
    let cardCount = 0
    let fileCount = 0
    let completed = 0

    for (const { entry, card } of resolved) {
      const slots = Array.from({ length: entry.quantity }, () => slot++)
      cardCount += entry.quantity

      const frontName = uniqueName(`${card.setCode}-${card.collectorNumber}-${card.name}`)
      await renderFace(entry.cardId, 0, entry.upscale, frontName)
      fileCount += 1
      this.deps.emit({ phase: 'preparing', completed: (completed += 1), total })

      let backFileName: string | undefined
      if (card.faces.length > 1) {
        backFileName = uniqueName(`${card.setCode}-${card.collectorNumber}-${card.name}-back`)
        await renderFace(entry.cardId, 1, entry.upscale, backFileName)
        fileCount += 1
        this.deps.emit({ phase: 'preparing', completed: (completed += 1), total })
      }

      xmlCards.push({
        fileName: frontName,
        query: card.name,
        slots,
        ...(backFileName && { backFileName })
      })
    }

    const cardBackName = uniqueName('cardback')
    await writeFile(join(folder, cardBackName), await mpcCardBack())
    fileCount += 1
    this.deps.emit({ phase: 'preparing', completed: (completed += 1), total })

    await writeFile(join(folder, 'order.xml'), buildMpcOrderXml(xmlCards, cardBackName), 'utf8')

    this.deps.emit({ phase: 'done', completed: total, total })
    return { path: folder, cardCount, fileCount }
  }
}
