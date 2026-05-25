import { computePageLayout, type ExportOptions } from '@shared/layout'

/** Card corner radius in points (~2.5mm), for rounded cut paths. */
const CORNER_RADIUS_PT = 7
const CUT_COLOR = '#e0115f'
const REG_COLOR = '#000000'
const REG_INSET = 16
const REG_ARM = 11

/** A registration crosshair + filled square at (x, y). */
function regMark(x: number, y: number): string {
  const a = REG_ARM
  return (
    `<line x1="${x - a}" y1="${y}" x2="${x + a}" y2="${y}" stroke="${REG_COLOR}" stroke-width="1"/>` +
    `<line x1="${x}" y1="${y - a}" x2="${x}" y2="${y + a}" stroke="${REG_COLOR}" stroke-width="1"/>` +
    `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="${REG_COLOR}"/>`
  )
}

/**
 * Builds an SVG cut file matching the print layout: each card's trim rectangle
 * as a rounded cut path (for craft cutters like Cricut/Silhouette, or a manual
 * guillotine), plus four corner registration marks for print-then-cut
 * alignment. For duplex, `mirror` flips the layout horizontally so the cut file
 * lines up with the printed backs. The geometry matches a full page, so it
 * applies to every printed sheet.
 */
export function buildCutFileSvg(options: ExportOptions, mirror = false): string {
  const layout = computePageLayout(options)
  const { pageWidthPt: w, pageHeightPt: h } = layout

  const cuts = layout.slots
    .map((slot) => {
      const cut = slot.cut
      const x = mirror ? w - (cut.x + cut.width) : cut.x
      const r = Math.min(CORNER_RADIUS_PT, cut.width / 2, cut.height / 2)
      return `<rect x="${x.toFixed(2)}" y="${cut.y.toFixed(2)}" width="${cut.width.toFixed(2)}" height="${cut.height.toFixed(2)}" rx="${r}" ry="${r}" fill="none" stroke="${CUT_COLOR}" stroke-width="0.5"/>`
    })
    .join('\n  ')

  const marks = [
    regMark(REG_INSET, REG_INSET),
    regMark(w - REG_INSET, REG_INSET),
    regMark(REG_INSET, h - REG_INSET),
    regMark(w - REG_INSET, h - REG_INSET)
  ].join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}pt" height="${h}pt" viewBox="0 0 ${w} ${h}">
  <!-- Registration marks (align print-then-cut to these) -->
  ${marks}
  <!-- Cut contours (one per card, at the trim line) -->
  ${cuts}
</svg>
`
}
