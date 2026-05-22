/**
 * Builds a Scryfall search string from free text plus structured filters.
 * Kept pure and shared so the renderer and tests agree on the syntax.
 */

export interface SearchFilters {
  /** Single-letter colour identities: w u b r g c. */
  colors: string[]
  type: string
  rarity: string
  format: string
  set: string
}

export const EMPTY_FILTERS: SearchFilters = {
  colors: [],
  type: '',
  rarity: '',
  format: '',
  set: ''
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

export function composeQuery(text: string, filters: SearchFilters): string {
  const parts: string[] = []

  const trimmed = text.trim()
  if (trimmed) parts.push(trimmed)
  if (filters.colors.length > 0) parts.push(`c>=${filters.colors.join('')}`)
  if (filters.type.trim()) parts.push(`t:${quoteIfNeeded(filters.type.trim())}`)
  if (filters.rarity) parts.push(`r:${filters.rarity}`)
  if (filters.format) parts.push(`f:${filters.format}`)
  if (filters.set.trim()) parts.push(`set:${filters.set.trim()}`)

  return parts.join(' ')
}

/** Whether any filter is active (used to show an "active" indicator). */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.colors.length > 0 ||
    filters.type.trim() !== '' ||
    filters.rarity !== '' ||
    filters.format !== '' ||
    filters.set.trim() !== ''
  )
}
