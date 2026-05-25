import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { CARD_HEIGHT_MM, CARD_WIDTH_MM, mmToPt } from '@shared/units'
import { pageDimensionsPt, type ExportOptions } from '@shared/layout'

const INK = rgb(0.1, 0.1, 0.1)
const REFERENCE_MM = 100

/**
 * A one-page "print at 100%" calibration sheet: a 100mm reference square and a
 * 63×88mm card outline. If the printed square measures exactly 100mm, the
 * printer is not scaling and proxies will come out the right size.
 */
export async function buildCalibrationPdf(options: ExportOptions): Promise<Uint8Array> {
  const { width, height } = pageDimensionsPt(options)
  const doc = await PDFDocument.create()
  const page = doc.addPage([width, height])
  const font = await doc.embedFont(StandardFonts.Helvetica)

  const text = (value: string, x: number, y: number, size = 11): void => {
    page.drawText(value, { x, y, size, font, color: INK })
  }

  text('PhoxxPhire Proxy Maker — print calibration', mmToPt(15), height - mmToPt(18), 14)
  text('Print this page at 100% / "Actual size" (no fit-to-page).', mmToPt(15), height - mmToPt(26))
  text(
    'Measure the square below — each side must be exactly 100 mm.',
    mmToPt(15),
    height - mmToPt(32)
  )

  // 100mm reference square with 10mm ruler ticks along the top edge.
  const sq = mmToPt(REFERENCE_MM)
  const sqX = mmToPt(15)
  const sqY = height - mmToPt(45) - sq
  page.drawRectangle({ x: sqX, y: sqY, width: sq, height: sq, borderColor: INK, borderWidth: 0.75 })
  for (let mm = 0; mm <= REFERENCE_MM; mm += 10) {
    const tickX = sqX + mmToPt(mm)
    page.drawLine({
      start: { x: tickX, y: sqY + sq },
      end: { x: tickX, y: sqY + sq - mmToPt(mm % 50 === 0 ? 6 : 3) },
      thickness: 0.5,
      color: INK
    })
  }
  text('100 mm', sqX + sq / 2 - mmToPt(8), sqY - mmToPt(6), 10)

  // A real card outline for a direct visual check.
  const cardX = sqX
  const cardY = sqY - mmToPt(18) - mmToPt(CARD_HEIGHT_MM)
  page.drawRectangle({
    x: cardX,
    y: cardY,
    width: mmToPt(CARD_WIDTH_MM),
    height: mmToPt(CARD_HEIGHT_MM),
    borderColor: INK,
    borderWidth: 0.75
  })
  text(
    'MTG card outline — 63 × 88 mm',
    cardX + mmToPt(CARD_WIDTH_MM) + mmToPt(6),
    cardY + mmToPt(CARD_HEIGHT_MM) - mmToPt(6),
    10
  )

  return doc.save()
}
