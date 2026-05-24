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
  /** Scryfall language code (e.g. ja, de); empty = English/default. */
  language: string
}

export const EMPTY_FILTERS: SearchFilters = {
  colors: [],
  type: '',
  rarity: '',
  format: '',
  set: '',
  language: ''
}

/** Scryfall language codes we offer, with display labels. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: '', label: 'English (default)' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ru', label: 'Russian' },
  { code: 'zhs', label: 'Chinese (Simplified)' },
  { code: 'zht', label: 'Chinese (Traditional)' }
]

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
  if (filters.language) parts.push(`lang:${filters.language}`)

  return parts.join(' ')
}

/** Whether any filter is active (used to show an "active" indicator). */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.colors.length > 0 ||
    filters.type.trim() !== '' ||
    filters.rarity !== '' ||
    filters.format !== '' ||
    filters.set.trim() !== '' ||
    filters.language !== ''
  )
}
