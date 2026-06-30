import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  computePageLayout,
  pageCountFor,
  type ExportOptions,
  type ExportProgress,
  type ExportSlot
} from '@shared/layout'
import { MPC_IMAGE_SUBDIR, type MpcCard } from '@shared/mpc'
import type { Card } from '@shared/scryfall'
import { squareOffCorners } from '../image/processor'
import { buildMpcOrderXml, type MpcXmlCard } from './mpc'
import { buildProxyPdf, splitPdfByPages } from './pdf'
import { buildPrintHtml } from './print-html'
import { buildZip } from './zip'

export interface ExportServiceDeps {
  /** Resolve a card's metadata (from cache or Scryfall) to know its face count. */
  resolveCard: (cardId: string) => Promise<Card>
  /** Path to a face image — upscaled when `useUpscaled` is set and available, else source. */
  ensureImage: (cardId: string, faceIndex: number, useUpscaled: boolean) => Promise<string>
  /** Path to a chosen MPCFill image by its Google Drive id (already full-bleed). */
  ensureMpcfillImage?: (identifier: string) => Promise<string>
  /** Path to a rendered text-proxy image for a face (required for `textProxy` slots). */
  proxyImage?: (cardId: string, faceIndex: number) => Promise<string>
  /**
   * Optionally transform image bytes (e.g. add mirrored bleed). `alreadyBled`
   * is set for MPCFill images, which ship with bleed — so the bleed step is
   * skipped to avoid double-bleeding (which would misalign the cut lines).
   */
  processImage?: (
    bytes: Uint8Array,
    options: ExportOptions,
    alreadyBled?: boolean
  ) => Promise<Uint8Array>
  /** Render a face image to MPC full-bleed spec (required for `exportMpc`). */
  mpcImage?: (bytes: Uint8Array) => Promise<Uint8Array>
  /** Build the common MPC card-back image (required for `exportMpc`). */
  mpcCardBack?: () => Promise<Uint8Array>
  /** The user's custom card-back image bytes, or null if none is installed. */
  customCardBack?: () => Promise<Uint8Array | null>
  /** Bundle a name → bytes map into a ZIP. Defaults to the built-in zlib writer. */
  zip?: (files: Record<string, Uint8Array>) => Uint8Array
  /** Fill transparent rounded corners with edge colour. Defaults to squareOffCorners. */
  squareCorners?: (bytes: Uint8Array) => Promise<Uint8Array>
  emit: (progress: ExportProgress) => void
}

function sanitizeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '_').replace(/^_+|_+$/g, '') || 'card'
}

/** File extension for image bytes, by magic number (PNG vs JPEG, default png). */
function imageExtension(bytes: Uint8Array): 'png' | 'jpg' {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpg' : 'png'
}

/**
 * Turns an ordered list of printable slots into a print-ready PDF: each slot is
 * one card face (so double-faced cards print both sides as separate proxies),
 * each unique face image is prepared once, and the PDF is written to disk in the
 * slots' given order. Whether a slot is upscaled is decided per slot (`upscale`).
 */
export class ExportService {
  constructor(private readonly deps: ExportServiceDeps) {}

  /**
   * Prepares everything the PDF and print renderers need: each unique card image
   * (processed once), the per-slot image index map, the optional custom back, the
   * per-slot rotation flags, and the per-slot duplex back overrides. Emits
   * `preparing` progress as images are processed.
   */
  private async prepareRender(
    slots: ExportSlot[],
    options: ExportOptions
  ): Promise<{
    uniqueImages: Uint8Array[]
    slotImageIndices: number[]
    backImage: Uint8Array | undefined
    slotRotations: boolean[]
    slotBackImages: (Uint8Array | null)[]
    cardCount: number
    pageCount: number
  }> {
    const slotKey = (slot: ExportSlot): string =>
      slot.mpcfillIdentifier
        ? `m ${slot.mpcfillIdentifier}`
        : `${slot.textProxy ? 'p' : slot.upscale ? 'u' : 's'} ${slot.faceIndex} ${slot.cardId}`

    // Prepare each unique image (per card / face / quality) exactly once. Blank
    // spacer slots carry no image and map to index -1.
    const uniqueSlots = new Map<string, ExportSlot>()
    for (const slot of slots) if (!slot.spacer) uniqueSlots.set(slotKey(slot), slot)
    const keys = [...uniqueSlots.keys()]
    const keyToIndex = new Map(keys.map((key, index) => [key, index]))
    const uniqueImages: Uint8Array[] = []

    let completed = 0
    for (const key of keys) {
      const slot = uniqueSlots.get(key)!
      const isMpcfill = Boolean(slot.mpcfillIdentifier && this.deps.ensureMpcfillImage)
      const path = isMpcfill
        ? await this.deps.ensureMpcfillImage!(slot.mpcfillIdentifier!)
        : slot.textProxy && this.deps.proxyImage
          ? await this.deps.proxyImage(slot.cardId, slot.faceIndex)
          : await this.deps.ensureImage(slot.cardId, slot.faceIndex, slot.upscale)
      const bytes = new Uint8Array(await readFile(path))
      uniqueImages.push(
        this.deps.processImage ? await this.deps.processImage(bytes, options, isMpcfill) : bytes
      )
      completed += 1
      this.deps.emit({ phase: 'preparing', completed, total: keys.length })
    }

    const slotImageIndices = slots.map((slot) =>
      slot.spacer ? -1 : keyToIndex.get(slotKey(slot))!
    )

    // Custom card back (when selected and available): square its corners first
    // (always — even for backs set before squaring existed, and regardless of
    // bleed mode), then run the same bleed + colour pipeline as the fronts.
    // Export silently uses the plain back otherwise.
    let backImage: Uint8Array | undefined
    if (options.cardBack === 'custom') {
      const rawBack = (await this.deps.customCardBack?.()) ?? null
      if (rawBack) {
        const squareCorners = this.deps.squareCorners ?? squareOffCorners
        const squaredBack = await squareCorners(rawBack)
        backImage = this.deps.processImage
          ? await this.deps.processImage(squaredBack, options)
          : squaredBack
      }
    }

    const slotRotations = slots.map((slot) => slot.rotate ?? false)

    // Duplex backs: a double-faced card prints its second face on the reverse
    // (overriding the custom/plain back); single-faced cards fall back to the
    // shared back. Built per slot, parallel to `slots`.
    const slotBackImages: (Uint8Array | null)[] = []
    if (options.cardBack !== 'none') {
      const dfcBackCache = new Map<string, Uint8Array>()
      for (const slot of slots) {
        if (slot.spacer) {
          slotBackImages.push(null)
          continue
        }
        const card = await this.deps.resolveCard(slot.cardId)
        if (card.faces.length > 1) {
          const cacheKey = `${slot.cardId} ${slot.upscale}`
          let back = dfcBackCache.get(cacheKey)
          if (!back) {
            const path = await this.deps.ensureImage(slot.cardId, 1, slot.upscale)
            const bytes = new Uint8Array(await readFile(path))
            back = this.deps.processImage ? await this.deps.processImage(bytes, options) : bytes
            dfcBackCache.set(cacheKey, back)
          }
          slotBackImages.push(back)
        } else {
          slotBackImages.push(null)
        }
      }
    }

    const layout = computePageLayout(options)
    return {
      uniqueImages,
      slotImageIndices,
      backImage,
      slotRotations,
      slotBackImages,
      cardCount: slots.filter((slot) => !slot.spacer).length,
      pageCount: pageCountFor(slots.length, layout.perPage)
    }
  }

  async export(
    slots: ExportSlot[],
    options: ExportOptions,
    savePath: string
  ): Promise<{ path: string; cardCount: number; pageCount: number; fileCount: number }> {
    const prepared = await this.prepareRender(slots, options)

    this.deps.emit({
      phase: 'rendering',
      completed: prepared.uniqueImages.length,
      total: prepared.uniqueImages.length
    })
    const pdf = await buildProxyPdf(
      prepared.uniqueImages,
      prepared.slotImageIndices,
      options,
      prepared.backImage,
      prepared.slotRotations,
      prepared.slotBackImages
    )

    // Optionally split into several files for print services that cap pages per
    // upload. Duplex backs must stay paired with their front, so keep page pairs.
    const parts = await splitPdfByPages(
      pdf,
      options.maxPagesPerFile ?? 0,
      options.cardBack !== 'none'
    )
    const primaryPath = await this.writePdfParts(parts, savePath)

    this.deps.emit({ phase: 'done', completed: slots.length, total: slots.length })
    return {
      path: primaryPath,
      cardCount: prepared.cardCount,
      pageCount: prepared.pageCount,
      fileCount: parts.length
    }
  }

  /**
   * Writes one or more PDF parts. A single part goes straight to `savePath`;
   * multiple parts are numbered (`name-1.pdf`, `name-2.pdf`, …). Returns the
   * path of the first file written.
   */
  private async writePdfParts(parts: Uint8Array[], savePath: string): Promise<string> {
    if (parts.length <= 1) {
      await writeFile(savePath, parts[0]!)
      return savePath
    }
    const dot = savePath.lastIndexOf('.')
    const stem = dot > 0 ? savePath.slice(0, dot) : savePath
    const ext = dot > 0 ? savePath.slice(dot) : '.pdf'
    const width = String(parts.length).length
    let firstPath = savePath
    for (let i = 0; i < parts.length; i += 1) {
      const partPath = `${stem}-${String(i + 1).padStart(width, '0')}${ext}`
      if (i === 0) firstPath = partPath
      await writeFile(partPath, parts[i]!)
    }
    return firstPath
  }

  /**
   * Renders the proxy sheet to a self-contained HTML document (images inlined as
   * data URLs) for printing — the same layout and image pipeline as the PDF, but
   * printable reliably via the OS print dialog.
   */
  async renderPrintHtml(
    slots: ExportSlot[],
    options: ExportOptions
  ): Promise<{ html: string; cardCount: number }> {
    const prepared = await this.prepareRender(slots, options)

    this.deps.emit({
      phase: 'rendering',
      completed: prepared.uniqueImages.length,
      total: prepared.uniqueImages.length
    })
    const html = buildPrintHtml(
      prepared.uniqueImages,
      prepared.slotImageIndices,
      options,
      prepared.backImage,
      prepared.slotRotations,
      prepared.slotBackImages
    )

    this.deps.emit({ phase: 'done', completed: slots.length, total: slots.length })
    return { html, cardCount: prepared.cardCount }
  }

  /** Collects the unique card faces across the slots, with the metadata exports need. */
  private async collectFaces(slots: ExportSlot[]): Promise<
    {
      cardId: string
      faceIndex: number
      upscale: boolean
      setCode: string
      collectorNumber: string
      name: string
      multiFace: boolean
    }[]
  > {
    const faces: Awaited<ReturnType<ExportService['collectFaces']>> = []
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
    return faces
  }

  /**
   * Prepares each unique face's exportable image: reads its bytes (upscaled per
   * the slot's flag, else source), fills transparent rounded corners with edge
   * colour so prints come out square, and assigns a unique file name with the
   * extension matching the actual bytes (`.jpg` upscaled, `.png` source).
   */
  private async prepareFaceFiles(
    slots: ExportSlot[]
  ): Promise<{ name: string; bytes: Uint8Array }[]> {
    const faces = await this.collectFaces(slots)
    const squareCorners = this.deps.squareCorners ?? squareOffCorners
    const files: { name: string; bytes: Uint8Array }[] = []
    const usedNames = new Set<string>()

    let completed = 0
    for (const face of faces) {
      const source = await this.deps.ensureImage(face.cardId, face.faceIndex, face.upscale)
      const bytes = await squareCorners(new Uint8Array(await readFile(source)))
      const suffix = face.multiFace ? `-${face.faceIndex + 1}` : ''
      const stem = `${sanitizeName(face.setCode)}-${sanitizeName(face.collectorNumber)}-${sanitizeName(face.name)}${suffix}`
      const ext = imageExtension(bytes)
      let name = `${stem}.${ext}`
      for (let n = 2; usedNames.has(name.toLowerCase()); n += 1) name = `${stem}-${n}.${ext}`
      usedNames.add(name.toLowerCase())
      files.push({ name, bytes })
      completed += 1
      this.deps.emit({ phase: 'preparing', completed, total: faces.length })
    }
    return files
  }

  /** Exports each unique card face as its own image file (corners squared) into `folder`. */
  async exportImages(
    slots: ExportSlot[],
    folder: string
  ): Promise<{ path: string; count: number }> {
    const files = await this.prepareFaceFiles(slots)
    for (const file of files) await writeFile(join(folder, file.name), file.bytes)
    this.deps.emit({ phase: 'done', completed: files.length, total: files.length })
    return { path: folder, count: files.length }
  }

  /**
   * Bundles every unique card face into a single ZIP at `savePath`. Each face is
   * exported at its current best quality (upscaled where the slot is flagged and
   * available, else source), with rounded corners squared and the file extension
   * matching the actual bytes.
   */
  async exportZip(slots: ExportSlot[], savePath: string): Promise<{ path: string; count: number }> {
    const files = await this.prepareFaceFiles(slots)
    const map: Record<string, Uint8Array> = {}
    for (const file of files) map[file.name] = file.bytes

    this.deps.emit({ phase: 'rendering', completed: files.length, total: files.length })
    const zipper = this.deps.zip ?? buildZip
    await writeFile(savePath, zipper(map))

    this.deps.emit({ phase: 'done', completed: files.length, total: files.length })
    return { path: savePath, count: files.length }
  }

  /**
   * Exports a deck as a MakePlayingCards (MPC Autofill) order into `folder`: an
   * `order.xml` plus one full-bleed PNG per card face and a common card-back
   * image, all written into a `cards/` subfolder — the layout the MPC Autofill
   * desktop tool resolves local images from. Double-faced cards become a single
   * physical card (front + paired back); single-faced cards use the common back.
   */
  async exportMpc(
    cards: MpcCard[],
    folder: string
  ): Promise<{ path: string; cardCount: number; fileCount: number }> {
    const { mpcImage, mpcCardBack } = this.deps
    if (!mpcImage || !mpcCardBack) {
      throw new Error('MPC export is not configured')
    }
    const imagesDir = join(folder, MPC_IMAGE_SUBDIR)
    await mkdir(imagesDir, { recursive: true })

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
      await writeFile(join(imagesDir, fileName), bytes)
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

    // Use the user's custom back (rendered to MPC spec) when installed, else the plain back.
    const customBack = (await this.deps.customCardBack?.()) ?? null
    const cardBackName = uniqueName('cardback')
    const cardBackBytes = customBack ? await mpcImage(customBack) : await mpcCardBack()
    await writeFile(join(imagesDir, cardBackName), cardBackBytes)
    fileCount += 1
    this.deps.emit({ phase: 'preparing', completed: (completed += 1), total })

    await writeFile(join(folder, 'order.xml'), buildMpcOrderXml(xmlCards, cardBackName), 'utf8')

    this.deps.emit({ phase: 'done', completed: total, total })
    return { path: folder, cardCount, fileCount }
  }
}
