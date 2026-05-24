import { describe, expect, it } from 'vitest'
import { isIllegal, legalityIn } from './legality'

describe('legalityIn', () => {
  it('returns the format status when known', () => {
    const card = { legalities: { modern: 'legal', vintage: 'restricted', standard: 'not_legal' } }
    expect(legalityIn(card, 'modern')).toBe('legal')
    expect(legalityIn(card, 'vintage')).toBe('restricted')
    expect(legalityIn(card, 'standard')).toBe('not_legal')
  })

  it('returns unknown when legalities are missing or the value is unexpected', () => {
    expect(legalityIn({}, 'modern')).toBe('unknown')
    expect(legalityIn({ legalities: {} }, 'modern')).toBe('unknown')
    expect(legalityIn({ legalities: { modern: 'weird' } }, 'modern')).toBe('unknown')
  })
})

describe('isIllegal', () => {
  it('flags only banned and not_legal, never legal/restricted/unknown', () => {
    expect(isIllegal('banned')).toBe(true)
    expect(isIllegal('not_legal')).toBe(true)
    expect(isIllegal('legal')).toBe(false)
    expect(isIllegal('restricted')).toBe(false)
    expect(isIllegal('unknown')).toBe(false)
  })
})
