import { describe, expect, it } from 'vitest'
import { composeQuery, EMPTY_FILTERS, hasActiveFilters } from '@shared/scryfallQuery'

describe('composeQuery', () => {
  it('returns the trimmed text when no filters are set', () => {
    expect(composeQuery('  lightning bolt ', EMPTY_FILTERS)).toBe('lightning bolt')
  })

  it('appends colour, type, rarity, format, set, and language clauses', () => {
    const query = composeQuery('bolt', {
      colors: ['r'],
      type: 'instant',
      rarity: 'common',
      format: 'modern',
      set: 'mh3',
      language: 'ja'
    })
    expect(query).toBe('bolt c>=r t:instant r:common f:modern set:mh3 lang:ja')
  })

  it('omits the language clause for the default (English) value', () => {
    expect(composeQuery('bolt', { ...EMPTY_FILTERS, language: '' })).toBe('bolt')
  })

  it('quotes multi-word type values', () => {
    expect(composeQuery('', { ...EMPTY_FILTERS, type: 'legendary creature' })).toBe(
      't:"legendary creature"'
    )
  })

  it('can build a filter-only query with no text', () => {
    expect(composeQuery('', { ...EMPTY_FILTERS, colors: ['w', 'u'] })).toBe('c>=wu')
  })

  it('returns an empty string when nothing is provided', () => {
    expect(composeQuery('   ', EMPTY_FILTERS)).toBe('')
  })
})

describe('hasActiveFilters', () => {
  it('detects active filters', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, rarity: 'mythic' })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, colors: ['g'] })).toBe(true)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, language: 'de' })).toBe(true)
  })
})
