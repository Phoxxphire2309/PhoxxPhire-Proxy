import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { DEFAULT_EXPORT_OPTIONS } from '@shared/layout'
import { buildCalibrationPdf } from './calibration'

describe('buildCalibrationPdf', () => {
  it('produces a single-page PDF sized to the chosen page', async () => {
    const bytes = await buildCalibrationPdf(DEFAULT_EXPORT_OPTIONS)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getPages()[0]!.getWidth()).toBeCloseTo(595.28, 0)
  })

  it('respects landscape orientation', async () => {
    const bytes = await buildCalibrationPdf({ ...DEFAULT_EXPORT_OPTIONS, orientation: 'landscape' })
    const doc = await PDFDocument.load(bytes)
    const page = doc.getPages()[0]!
    expect(page.getWidth()).toBeGreaterThan(page.getHeight())
  })
})
