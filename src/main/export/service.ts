import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  computePageLayout,
  pageCountFor,
  type ExportOptions,
  type ExportProgress,
  type ExportRequestCard
} from '@shared/layout'
import type { Card } from '@shared/scryfall'
import { buildProxyPdf } from './pdf'

export interface ExportServiceDeps {
  /** Resolve a card's metadata (from cache or Scryfall) to know its face count. */
  resolveCard: (cardId: string) => Promise<Card>
  /** Path to a face image — upscaled when `useUpscaled` is set and available, else source. */
  ensureImage: (cardId: string, faceIndex: number, useUpscaled: boolean) => Promise<string>
  /** Optionally transform image bytes (e.g. add mirrored bleed). Defaults to passthrough. */
  processImage?: (bytes: Uint8Array, options: ExportOptions) => Promise<Uint8Array>
  emit: (progress: ExportProgress) => void
}

interface SlotSpec {
  cardId: string
  faceIndex: number
  upscale: boolean
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'card'
}

/**
 * Turns a deck into a print-ready PDF: every copy of every card contributes a
 * slot per face (so double-faced cards print both sides as separate proxies),
 * each unique face image is prepared once, and the PDF is written to disk.
 * Whether a card is upscaled is decided per card (the `upscale` flag).
 */
export class ExportService {
  constructor(private readonly deps: ExportServiceDeps) {}

  private expandSlots(cards: ExportRequestCard[]): SlotSpec[] {
    const slots: SlotSpec[] = []
    for (const entry of cards) {
      for (let faceIndex = 0; faceIndex < entry.quantities.length; faceIndex += 1) {
        for (let copy = 0; copy < entry.quantities[faceIndex]!; copy += 1) {
          slots.push({ cardId: entry.id, faceIndex, upscale: entry.upscale })
        }
      }
    }
    return slots
  }

  async export(
    cards: ExportRequestCard[],
    options: ExportOptions,
    savePath: string
  ): Promise<{ path: string; cardCount: number; pageCount: number }> {
    const slots = this.expandSlots(cards)
    const slotKey = (slot: SlotSpec): string =>
      `${slot.upscale ? 'u' : 's'} ${slot.faceIndex} ${slot.cardId}`

    // Prepare each unique image (per card / face / quality) exactly once.
    const uniqueSlots = new Map<string, SlotSpec>()
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

  /** Exports each unique card face as its own PNG (upscaled per the card's flag) into `folder`. */
  async exportImages(
    cards: ExportRequestCard[],
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

    for (const entry of cards) {
      const card = await this.deps.resolveCard(entry.id)
      const multiFace = card.faces.length > 1
      for (let faceIndex = 0; faceIndex < entry.quantities.length; faceIndex += 1) {
        if (entry.quantities[faceIndex]! <= 0) continue
        const key = `${entry.id} ${faceIndex}`
        if (seen.has(key)) continue
        seen.add(key)
        faces.push({
          cardId: entry.id,
          faceIndex,
          upscale: entry.upscale,
          setCode: card.setCode,
          collectorNumber: card.collectorNumber,
          name: card.name,
          multiFace
        })
      }
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
}
