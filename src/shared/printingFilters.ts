/**
 * Printing filters: persistent "hide this kind of version" rules applied when the
 * user picks which printing/art of a card to print, and when auto-selecting a
 * printing in bulk. Each filter tests a card's attributes (border, frame, set
 * category, legality, …) and returns true when the printing should be hidden.
 */

import type { Card } from './scryfall'

export interface PrintingFilter {
  key: string
  label: string
  /** True when this filter hides the given printing. */
  hidden: (card: Card) => boolean
}

function frameHas(card: Card, effect: string): boolean {
  return (card.frameEffects ?? []).includes(effect)
}

/** General "skip this kind of version" filters. */
export const GENERAL_PRINTING_FILTERS: PrintingFilter[] = [
  {
    key: 'funny',
    label: '“Funny” / Un-set cards',
    hidden: (c) => c.setType === 'funny' || c.securityStamp === 'acorn'
  },
  { key: 'borderless', label: 'Borderless', hidden: (c) => c.borderColor === 'borderless' },
  { key: 'full-art', label: 'Full-art', hidden: (c) => c.fullArt === true },
  { key: 'extended-art', label: 'Extended-art', hidden: (c) => frameHas(c, 'extendedart') },
  { key: 'showcase', label: 'Showcase frames', hidden: (c) => frameHas(c, 'showcase') },
  { key: 'textless', label: 'Textless', hidden: (c) => c.textless === true },
  { key: 'oversized', label: 'Oversized', hidden: (c) => c.oversized === true },
  {
    key: 'digital',
    label: 'Digital-only (no paper printing)',
    hidden: (c) => c.digital === true || (c.games !== undefined && !c.games.includes('paper'))
  },
  {
    key: 'low-res',
    label: 'Low-resolution scans',
    hidden: (c) => c.imageStatus !== undefined && c.imageStatus !== 'highres_scan'
  },
  {
    key: 'gold-bordered',
    label: 'Gold-bordered (Championship)',
    hidden: (c) => c.borderColor === 'gold'
  },
  { key: 'white-bordered', label: 'White-bordered', hidden: (c) => c.borderColor === 'white' },
  {
    key: 'content-warning',
    label: 'Cards with a content warning',
    hidden: (c) => c.contentWarning === true
  }
]

/** Formats offered as "hide cards banned in …" toggles. */
const BANNABLE_FORMATS: { key: string; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'pioneer', label: 'Pioneer' },
  { key: 'modern', label: 'Modern' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'pauper', label: 'Pauper' },
  { key: 'commander', label: 'Commander' }
]

export const FORMAT_BAN_FILTERS: PrintingFilter[] = BANNABLE_FORMATS.map((format) => ({
  key: `banned-${format.key}`,
  label: `Banned in ${format.label}`,
  hidden: (card) => card.legalities?.[format.key] === 'banned'
}))

export const ALL_PRINTING_FILTERS: PrintingFilter[] = [
  ...GENERAL_PRINTING_FILTERS,
  ...FORMAT_BAN_FILTERS
]

const FILTER_BY_KEY = new Map(ALL_PRINTING_FILTERS.map((filter) => [filter.key, filter]))

/** True when the printing matches any enabled filter (i.e. it should be hidden). */
export function printingHidden(card: Card, activeKeys: Iterable<string>): boolean {
  for (const key of activeKeys) {
    const filter = FILTER_BY_KEY.get(key)
    if (filter?.hidden(card)) return true
  }
  return false
}
