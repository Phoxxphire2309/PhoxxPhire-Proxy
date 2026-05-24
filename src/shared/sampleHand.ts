/**
 * Pure helpers for the "sample opening hand" playtest tool: building a draw
 * library from the deck and shuffling it. Kept free of any rendering or store
 * concerns so the draw logic can be unit-tested deterministically.
 */

/** One physical copy in the library (the front face is what we show). */
export interface LibraryCard {
  cardId: string
  name: string
}

/** A deck entry that contributes `copies` cards to the library. */
export interface LibrarySource {
  cardId: string
  name: string
  copies: number
}

/** Expands deck sources into one library entry per copy. */
export function buildLibrary(sources: readonly LibrarySource[]): LibraryCard[] {
  const library: LibraryCard[] = []
  for (const source of sources) {
    for (let copy = 0; copy < source.copies; copy += 1) {
      library.push({ cardId: source.cardId, name: source.name })
    }
  }
  return library
}

/**
 * Returns a shuffled copy of `items` (Fisher–Yates), never mutating the input.
 * `rng` is injectable so tests can be deterministic.
 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
