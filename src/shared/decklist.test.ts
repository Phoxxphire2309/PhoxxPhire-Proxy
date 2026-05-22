import { describe, expect, it } from 'vitest'
import { parseDecklist } from '@shared/decklist'

describe('parseDecklist', () => {
  it('parses plain quantity + name lines', () => {
    expect(parseDecklist('4 Lightning Bolt')).toEqual([{ quantity: 4, name: 'Lightning Bolt' }])
  })

  it('accepts the "x" quantity form and defaults missing quantities to 1', () => {
    expect(parseDecklist('4x Lightning Bolt')).toEqual([{ quantity: 4, name: 'Lightning Bolt' }])
    expect(parseDecklist('Sol Ring')).toEqual([{ quantity: 1, name: 'Sol Ring' }])
  })

  it('parses the MTG Arena set + collector number form', () => {
    expect(parseDecklist('4 Lightning Bolt (M21) 159')).toEqual([
      { quantity: 4, name: 'Lightning Bolt', setCode: 'M21', collectorNumber: '159' }
    ])
  })

  it('keeps the set code even when the collector number is absent', () => {
    expect(parseDecklist('1 Sol Ring (C21)')).toEqual([
      { quantity: 1, name: 'Sol Ring', setCode: 'C21' }
    ])
  })

  it('strips trailing foil/condition markers', () => {
    expect(parseDecklist('1 Sol Ring (C21) 263 *F*')).toEqual([
      { quantity: 1, name: 'Sol Ring', setCode: 'C21', collectorNumber: '263' }
    ])
  })

  it('preserves names containing parenthetical phrases with spaces', () => {
    // The set group only matches space-free tokens, so this stays in the name.
    expect(parseDecklist('1 Erase (Not the Common One)')).toEqual([
      { quantity: 1, name: 'Erase (Not the Common One)' }
    ])
  })

  it('handles split-card names with //', () => {
    expect(parseDecklist('1 Fire // Ice')).toEqual([{ quantity: 1, name: 'Fire // Ice' }])
  })

  it('skips blank lines, comments, and section headers', () => {
    const text = [
      'Deck',
      '',
      '4 Lightning Bolt',
      '# a comment',
      '// another',
      'Sideboard',
      '2 Negate'
    ].join('\n')
    expect(parseDecklist(text)).toEqual([
      { quantity: 4, name: 'Lightning Bolt' },
      { quantity: 2, name: 'Negate' }
    ])
  })

  it('tolerates Windows line endings and surrounding whitespace', () => {
    expect(parseDecklist('  3 Counterspell  \r\n2 Brainstorm')).toEqual([
      { quantity: 3, name: 'Counterspell' },
      { quantity: 2, name: 'Brainstorm' }
    ])
  })
})
