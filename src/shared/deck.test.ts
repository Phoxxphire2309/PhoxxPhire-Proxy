import { describe, expect, it } from 'vitest'
import { DECK_SECTIONS, isPrintableSection } from '@shared/deck'

describe('isPrintableSection', () => {
  it('prints every section except the maybeboard', () => {
    expect(isPrintableSection('main')).toBe(true)
    expect(isPrintableSection('commander')).toBe(true)
    expect(isPrintableSection('sideboard')).toBe(true)
    expect(isPrintableSection('maybeboard')).toBe(false)
  })

  it('lists all sections', () => {
    expect(DECK_SECTIONS).toContain('main')
    expect(DECK_SECTIONS).toContain('maybeboard')
    expect(DECK_SECTIONS).toHaveLength(4)
  })
})
