/**
 * Builds a Scryfall search string from free text plus structured filters.
 * Kept pure and shared so the renderer and tests agree on the syntax.
 */

export interface SearchFilters {
  /** Single-letter colour identities: w u b r g c. */
  colors: string[]
  type: string
  subtype: string
  rarity: string
  format: string
  set: string
  artist: string
  /** Mana value bounds as strings (empty = unbounded). */
  manaMin: string
  manaMax: string
  /** Scryfall language code (e.g. ja, de); empty = English/default. */
  language: string
}

export const EMPTY_FILTERS: SearchFilters = {
  colors: [],
  type: '',
  subtype: '',
  rarity: '',
  format: '',
  set: '',
  artist: '',
  manaMin: '',
  manaMax: '',
  language: ''
}

/**
 * Result ordering options, mapped to Scryfall's `order` + `dir` parameters.
 * Directional variants are offered for every field that supports them.
 */
export const SORT_OPTIONS = [
  { key: 'relevance', label: 'Relevance', order: '', dir: '' },
  { key: 'name-asc', label: 'Name: A → Z', order: 'name', dir: 'asc' },
  { key: 'name-desc', label: 'Name: Z → A', order: 'name', dir: 'desc' },
  { key: 'cmc-asc', label: 'Mana value: low → high', order: 'cmc', dir: 'asc' },
  { key: 'cmc-desc', label: 'Mana value: high → low', order: 'cmc', dir: 'desc' },
  { key: 'price-asc', label: 'Price: low → high', order: 'usd', dir: 'asc' },
  { key: 'price-desc', label: 'Price: high → low', order: 'usd', dir: 'desc' },
  { key: 'released-desc', label: 'Release: newest', order: 'released', dir: 'desc' },
  { key: 'released-asc', label: 'Release: oldest', order: 'released', dir: 'asc' }
] as const

export type SortKey = (typeof SORT_OPTIONS)[number]['key']

/** The Scryfall `order`/`dir` params for a sort key (empty order = default relevance). */
export function sortParams(key: SortKey): { order?: string; dir?: 'asc' | 'desc' } {
  const option = SORT_OPTIONS.find((entry) => entry.key === key)
  if (!option || !option.order) return {}
  return { order: option.order, dir: option.dir as 'asc' | 'desc' }
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
  if (filters.subtype.trim()) parts.push(`t:${quoteIfNeeded(filters.subtype.trim())}`)
  if (filters.rarity) parts.push(`r:${filters.rarity}`)
  if (filters.format) parts.push(`f:${filters.format}`)
  if (filters.set.trim()) parts.push(`set:${filters.set.trim()}`)
  if (filters.artist.trim()) parts.push(`a:${quoteIfNeeded(filters.artist.trim())}`)
  if (filters.manaMin.trim()) parts.push(`mv>=${filters.manaMin.trim()}`)
  if (filters.manaMax.trim()) parts.push(`mv<=${filters.manaMax.trim()}`)
  if (filters.language) parts.push(`lang:${filters.language}`)

  return parts.join(' ')
}

/** Whether any filter is active (used to show an "active" indicator). */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return (
    filters.colors.length > 0 ||
    filters.type.trim() !== '' ||
    filters.subtype.trim() !== '' ||
    filters.rarity !== '' ||
    filters.format !== '' ||
    filters.set.trim() !== '' ||
    filters.artist.trim() !== '' ||
    filters.manaMin.trim() !== '' ||
    filters.manaMax.trim() !== '' ||
    filters.language !== ''
  )
}
