import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPORT_OPTIONS } from '@shared/layout'
import { buildPrintHtml } from './print-html'

// Zero bleed + 6mm margin yields a 3×3 (9 per page) grid on A4.
const NINE_UP = { ...DEFAULT_EXPORT_OPTIONS, bleedMm: 0, marginMm: 6 }

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 9, 9])

const countPages = (html: string): number => (html.match(/class="page"/g) ?? []).length

describe('buildPrintHtml', () => {
  it('inlines images as base64 data URLs, sniffing PNG vs JPEG, with an @page rule', () => {
    const html = buildPrintHtml([PNG, JPEG], [0, 1], NINE_UP)
    expect(html).toContain('data:image/png;base64,')
    expect(html).toContain('data:image/jpeg;base64,')
    expect(html).toContain('@page') // page size drives physical sheet dimensions
  })

  it('emits one page for nine cards and paginates past a full sheet', () => {
    expect(
      countPages(
        buildPrintHtml(
          [PNG],
          Array.from({ length: 9 }, () => 0),
          NINE_UP
        )
      )
    ).toBe(1)
    expect(
      countPages(
        buildPrintHtml(
          [PNG],
          Array.from({ length: 10 }, () => 0),
          NINE_UP
        )
      )
    ).toBe(2)
  })

  it('interleaves a back page per front page when card backs are enabled', () => {
    const html = buildPrintHtml(
      [PNG],
      Array.from({ length: 9 }, () => 0),
      {
        ...NINE_UP,
        cardBack: 'plain'
      }
    )
    expect(countPages(html)).toBe(2) // one front + one back
    expect(html).toContain('class="back"') // plain dark back rendered
  })

  it('skips a spacer (index -1) and renders nothing for it', () => {
    const html = buildPrintHtml([PNG], [0, -1], NINE_UP)
    // The spacer contributes no image; exactly one card image is emitted.
    expect((html.match(/<img class="card"/g) ?? []).length).toBe(1)
  })

  it('applies a 180° rotation only to a flagged slot', () => {
    const flipped = buildPrintHtml([PNG], [0], NINE_UP, undefined, [true])
    const plain = buildPrintHtml([PNG], [0], NINE_UP, undefined, [false])
    expect(flipped).toContain('<img class="card card--flip"')
    expect(plain).not.toContain('<img class="card card--flip"')
  })

  it('still emits a blank page when there are no cards', () => {
    expect(countPages(buildPrintHtml([], [], DEFAULT_EXPORT_OPTIONS))).toBe(1)
  })
})
