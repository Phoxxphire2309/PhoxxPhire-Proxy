import {
  computePageLayout,
  pageCountFor,
  type CutGuideStyle,
  type ExportOptions,
  type Rect
} from '@shared/layout'
import { mmToPt } from '@shared/units'

const GUIDE_COLOR = '#8c8c8c'
const GUIDE_THICKNESS_PT = 0.5
const CORNER_MARK_PT = 10
const BACK_COLOR = '#1f2024'

/** A base64 data URL for image bytes, sniffing JPEG vs PNG by magic number. */
function dataUrl(bytes: Uint8Array): string {
  const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png'
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
}

function rectStyle(rect: Rect): string {
  return `left:${rect.x}pt;top:${rect.y}pt;width:${rect.width}pt;height:${rect.height}pt;`
}

/** Cut-guide overlay HTML for a trim rect (top-left coords, same as the layout). */
function guideHtml(cut: Rect, style: CutGuideStyle): string {
  if (style === 'none') return ''
  if (style === 'outline') {
    return `<div class="guide-outline" style="${rectStyle(cut)}"></div>`
  }
  // 'corners': an L-shaped mark at each corner.
  const m = CORNER_MARK_PT
  const t = GUIDE_THICKNESS_PT
  const right = cut.x + cut.width
  const bottom = cut.y + cut.height
  const h = (x: number, y: number): string =>
    `<div class="guide-line" style="left:${x}pt;top:${y}pt;width:${m}pt;height:${t}pt;"></div>`
  const v = (x: number, y: number): string =>
    `<div class="guide-line" style="left:${x}pt;top:${y}pt;width:${t}pt;height:${m}pt;"></div>`
  return [
    h(cut.x, cut.y),
    v(cut.x, cut.y),
    h(right - m, cut.y),
    v(right - t, cut.y),
    h(cut.x, bottom - t),
    v(cut.x, bottom - m),
    h(right - m, bottom - t),
    v(right - t, bottom - m)
  ].join('')
}

/** A faint diagonal "PROXY" watermark centred on the trim rect. */
function watermarkHtml(cut: Rect): string {
  const size = Math.min(cut.width, cut.height) * 0.22
  return (
    `<div class="watermark" style="left:${cut.x}pt;top:${cut.y}pt;` +
    `width:${cut.width}pt;height:${cut.height}pt;font-size:${size}pt;">PROXY</div>`
  )
}

/**
 * Builds a print-ready HTML document equivalent to {@link buildProxyPdf}: the
 * same grid, bleed-processed images, cut guides, rotation, watermark, and
 * mirrored duplex back pages. Rendered in an offscreen window and printed via
 * the OS dialog — far more reliable than printing a loaded PDF.
 */
export function buildPrintHtml(
  uniqueImages: Uint8Array[],
  slotImageIndices: number[],
  options: ExportOptions,
  backImage?: Uint8Array,
  slotRotations: boolean[] = [],
  slotBackImages: (Uint8Array | null)[] = []
): string {
  const layout = computePageLayout(options)
  const { pageWidthPt: pw, pageHeightPt: ph } = layout

  const css = `
    @page { size: ${pw}pt ${ph}pt; margin: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .page { position: relative; width: ${pw}pt; height: ${ph}pt; overflow: hidden; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    .card { position: absolute; object-fit: fill; }
    .card--flip { transform: rotate(180deg); }
    .back { position: absolute; background: ${BACK_COLOR}; }
    .guide-outline { position: absolute; box-sizing: border-box; border: ${GUIDE_THICKNESS_PT}pt solid ${GUIDE_COLOR}; }
    .guide-line { position: absolute; background: ${GUIDE_COLOR}; }
    .watermark { position: absolute; display: flex; align-items: center; justify-content: center;
      color: #000; opacity: 0.16; font-family: Helvetica, Arial, sans-serif; font-weight: 700;
      transform: rotate(-45deg); }
  `

  const images = uniqueImages.map(dataUrl)
  const backUrl = options.cardBack === 'custom' && backImage ? dataUrl(backImage) : null
  const overrideUrls = new Map<Uint8Array, string>()
  for (const bytes of slotBackImages)
    if (bytes && !overrideUrls.has(bytes)) overrideUrls.set(bytes, dataUrl(bytes))

  const pageCount = pageCountFor(slotImageIndices.length, layout.perPage)
  const pages: string[] = []

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const front: string[] = []
    const blankOnPage: boolean[] = []
    let slotsOnPage = 0

    for (let slotIndex = 0; slotIndex < layout.perPage; slotIndex += 1) {
      const globalIndex = pageIndex * layout.perPage + slotIndex
      if (globalIndex >= slotImageIndices.length) break
      const slot = layout.slots[slotIndex]!
      const imageIndex = slotImageIndices[globalIndex]!
      if (imageIndex < 0) {
        blankOnPage[slotIndex] = true
        slotsOnPage += 1
        continue
      }
      blankOnPage[slotIndex] = false
      const flip = slotRotations[globalIndex] ? ' card--flip' : ''
      front.push(
        `<img class="card${flip}" style="${rectStyle(slot.bleed)}" src="${images[imageIndex]!}">`
      )
      front.push(guideHtml(slot.cut, options.cutGuideStyle))
      if (options.watermark) front.push(watermarkHtml(slot.cut))
      slotsOnPage += 1
    }
    pages.push(`<div class="page">${front.join('')}</div>`)

    if (options.cardBack !== 'none') {
      const back: string[] = []
      // Duplex registration offset (+X right, +Y up). HTML Y is top-down, so a
      // positive (upward) Y offset subtracts from the top coordinate.
      const offX = mmToPt(options.backOffsetXMm ?? 0)
      const offY = mmToPt(options.backOffsetYMm ?? 0)
      for (let slotIndex = 0; slotIndex < slotsOnPage; slotIndex += 1) {
        if (blankOnPage[slotIndex]) continue
        const slot = layout.slots[slotIndex]!
        // Mirror X so backs line up with fronts under duplex printing.
        const mirrored: Rect = {
          x: pw - (slot.bleed.x + slot.bleed.width) + offX,
          y: slot.bleed.y - offY,
          width: slot.bleed.width,
          height: slot.bleed.height
        }
        const override = slotBackImages[pageIndex * layout.perPage + slotIndex]
        const url = override ? overrideUrls.get(override)! : backUrl
        back.push(
          url
            ? `<img class="card" style="${rectStyle(mirrored)}" src="${url}">`
            : `<div class="back" style="${rectStyle(mirrored)}"></div>`
        )
        const mirroredCut: Rect = {
          x: pw - (slot.cut.x + slot.cut.width) + offX,
          y: slot.cut.y - offY,
          width: slot.cut.width,
          height: slot.cut.height
        }
        back.push(guideHtml(mirroredCut, options.cutGuideStyle))
      }
      pages.push(`<div class="page">${back.join('')}</div>`)
    }
  }

  if (pages.length === 0) pages.push(`<div class="page"></div>`)

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${pages.join('')}</body></html>`
}
