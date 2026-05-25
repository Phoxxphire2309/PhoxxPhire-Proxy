/** A card entry sent to the combo finder. */
export interface ComboCardInput {
  name: string
  quantity: number
  /** Commander-zone card (goes in the request's `commanders` list). */
  commander: boolean
}

/** A combo present in the deck, normalised from the Commander Spellbook API. */
export interface DeckCombo {
  id: string
  /** Card names that make up the combo. */
  uses: string[]
  /** What the combo produces / does (feature names). */
  produces: string[]
  /** Steps / prerequisites description, if provided. */
  description?: string
}

/** Result of a combo lookup. */
export type ComboResult = { ok: true; combos: DeckCombo[] } | { ok: false; error: string }
