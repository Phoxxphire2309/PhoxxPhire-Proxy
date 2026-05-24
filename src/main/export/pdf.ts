import { PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import {
  computePageLayout,
  pageCountFor,
  type CutGuideStyle,
  type ExportOptions,
  type Rect,
  type Slot
} from '@shared/layout'

const GUIDE_COLOR = rgb(0.55, 0.55, 0.55)
const GUIDE_THICKNESS = 0.5
const CORNER_MARK_PT = 10
const BACK_COLOR = rgb(0.12, 0.12, 0.14)

/** Cut rect edges/corners, converted from top-left layout coords to PDF space. */
function cutEdges(
  pageHeight: number,
  cut: Rect
): { left: number; right: number; top: number; bottom: number } {
  return {
    left: cut.x,
    right: cut.x + cut.width,
    top: pageHeight - cut.y,
    bottom: pageHeight - (cut.y + cut.height)
  }
}

function drawCutGuide(page: PDFPage, pageHeight: number, cut: Rect, style: CutGuideStyle): void {
  if (style === 'none') return
  const { left, right, top, bottom } = cutEdges(pageHeight, cut)
  const line = (sx: number, sy: number, ex: number, ey: number): void => {
    page.drawLine({
      start: { x: sx, y: sy },
      end: { x: ex, y: ey },
      thickness: GUIDE_THICKNESS,
      color: GUIDE_COLOR
    })
  }

  if (style === 'outline') {
    line(left, top, right, top)
    line(left, bottom, right, bottom)
    line(left, bottom, left, top)
    line(right, bottom, right, top)
    return
  }

  // 'corners': short marks at each corner only.
  const m = CORNER_MARK_PT
  line(left, top, left + m, top)
  line(left, top, left, top - m)
  line(right, top, right - m, top)
  line(right, top, right, top - m)
  line(left, bottom, left + m, bottom)
  line(left, bottom, left, bottom + m)
  line(right, bottom, right - m, bottom)
  line(right, bottom, right, bottom + m)
}

/** Draws a plain card back into the bleed rect (mirrored horizontally for duplex). */
function drawBack(page: PDFPage, pageWidth: number, pageHeight: number, slot: Slot): void {
  const mirroredX = pageWidth - (slot.bleed.x + slot.bleed.width)
  const y = pageHeight - (slot.bleed.y + slot.bleed.height)
  page.drawRectangle({
    x: mirroredX,
    y,
    width: slot.bleed.width,
    height: slot.bleed.height,
    color: BACK_COLOR
  })
}

async function embedImage(
  doc: PDFDocument,
  bytes: Uint8Array
): Promise<Awaited<ReturnType<PDFDocument['embedPng']>>> {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? doc.embedJpg(bytes) : doc.embedPng(bytes)
}

/**
 * Builds a print-ready proxy PDF. `slotImageIndices` maps each printed slot (in
 * order) to an entry in `uniqueImages`, so duplicate cards are embedded once.
 * When `cardBack` is enabled, a mirrored back page is interleaved after each
 * front page for double-sided (duplex) printing: a custom `backImage` is drawn
 * when `cardBack === 'custom'` and one is supplied, otherwise a plain dark back.
 */
export async function buildProxyPdf(
  uniqueImages: Uint8Array[],
  slotImageIndices: number[],
  options: ExportOptions,
  backImage?: Uint8Array
): Promise<Uint8Array> {
  const layout = computePageLayout(options)
  const doc = await PDFDocument.create()

  if (layout.perPage === 0 || slotImageIndices.length === 0) {
    doc.addPage([layout.pageWidthPt, layout.pageHeightPt])
    return doc.save()
  }

  const embedded = await Promise.all(uniqueImages.map((bytes) => embedImage(doc, bytes)))
  const backEmbed =
    options.cardBack === 'custom' && backImage ? await embedImage(doc, backImage) : null
  const pageCount = pageCountFor(slotImageIndices.length, layout.perPage)

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = doc.addPage([layout.pageWidthPt, layout.pageHeightPt])
    let slotsOnPage = 0

    for (let slotIndex = 0; slotIndex < layout.perPage; slotIndex += 1) {
      const globalIndex = pageIndex * layout.perPage + slotIndex
      if (globalIndex >= slotImageIndices.length) break

      const slot = layout.slots[slotIndex]!
      const image = embedded[slotImageIndices[globalIndex]!]!
      const drawY = layout.pageHeightPt - (slot.bleed.y + slot.bleed.height)
      page.drawImage(image, {
        x: slot.bleed.x,
        y: drawY,
        width: slot.bleed.width,
        height: slot.bleed.height
      })
      drawCutGuide(page, layout.pageHeightPt, slot.cut, options.cutGuideStyle)
      slotsOnPage += 1
    }

    if (options.cardBack !== 'none') {
      const backPage = doc.addPage([layout.pageWidthPt, layout.pageHeightPt])
      for (let slotIndex = 0; slotIndex < slotsOnPage; slotIndex += 1) {
        const slot = layout.slots[slotIndex]!
        if (backEmbed) {
          // Mirror the X position so backs line up with fronts under duplex printing.
          const mirroredX = layout.pageWidthPt - (slot.bleed.x + slot.bleed.width)
          backPage.drawImage(backEmbed, {
            x: mirroredX,
            y: layout.pageHeightPt - (slot.bleed.y + slot.bleed.height),
            width: slot.bleed.width,
            height: slot.bleed.height
          })
        } else {
          drawBack(backPage, layout.pageWidthPt, layout.pageHeightPt, slot)
        }
        const mirroredCut: Rect = {
          x: layout.pageWidthPt - (slot.cut.x + slot.cut.width),
          y: slot.cut.y,
          width: slot.cut.width,
          height: slot.cut.height
        }
        drawCutGuide(backPage, layout.pageHeightPt, mirroredCut, options.cutGuideStyle)
      }
    }
  }

  return doc.save()
}
