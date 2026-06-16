/**
 * App changelog, shown in the in-app "What's new" view. Newest version first —
 * add a new entry at the top for each release (set `date` when you publish it).
 * Keep entries friendly and non-technical: describe what changed for players.
 */

export interface ChangelogEntry {
  version: string
  /** ISO date (e.g. '2026-06-16'), or null while unreleased. */
  date: string | null
  highlights: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '2026-06-16',
    highlights: [
      'Deck Library — save the decks you’ve built and re-open them to print again any time, from the Decks tab.',
      'Cleaner artwork choices — when picking a card’s art, you can hide versions you don’t want: joke cards, borderless, full-art, online-only, low-quality scans, and cards banned in a format you choose.',
      'More ways to import a decklist — paste lists from more apps and websites, and optionally skip basic lands.',
      'Print your deck in another language — German, French, Japanese and more, whenever that version of a card exists.',
      'Saved PDFs and images are now named after your deck, so they’re easy to find.',
      'Added A5 and Tabloid paper sizes, and the app now starts on the right paper size for your region (US Letter or A4).',
      'Print-quality fixes — cards now print at the exact right size, the margins line up for double-sided (front and back) printing, and card corners print cleanly without a faint white edge.'
    ]
  },
  {
    version: '1.0.1',
    date: '2026-06-16',
    highlights: [
      'Added a banner that lets you know when a newer version of the app is available.',
      'Behind-the-scenes improvements.'
    ]
  },
  {
    version: '1.0.0',
    date: null,
    highlights: [
      'First release.',
      'Search for cards, build decks, and import lists by pasting text or a deck-site link.',
      'AI image sharpening and automatic bleed for crisp, edge-to-edge proxies.',
      'Print directly, or save a print-ready PDF, images, or a professional print order — with double-sided backs, cut guides, and a size-calibration page.'
    ]
  }
]

/** The newest version in the changelog (used to detect a fresh install/upgrade). */
export const LATEST_VERSION = CHANGELOG[0]?.version ?? ''
