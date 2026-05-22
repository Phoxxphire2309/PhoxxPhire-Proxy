import { describe, expect, it } from 'vitest'
import type { ScryfallCard } from '@shared/scryfall'
import { normalizeCard } from './normalize'

const base: ScryfallCard = {
  id: 'abc-123',
  oracle_id: 'oracle-1',
  name: 'Lightning Bolt',
  set: 'lea',
  collector_number: '161',
  lang: 'en',
  layout: 'normal'
}

describe('normalizeCard', () => {
  it('maps a single-faced card to one face using the png image', () => {
    const card = normalizeCard({
      ...base,
      image_uris: { png: 'https://img/bolt.png', large: 'https://img/bolt-large.jpg' }
    })
    expect(card.faces).toEqual([{ name: 'Lightning Bolt', imageUrl: 'https://img/bolt.png' }])
    expect(card.oracleId).toBe('oracle-1')
    expect(card.setCode).toBe('lea')
  })

  it('falls back to large then normal when png is absent', () => {
    const large = normalizeCard({ ...base, image_uris: { large: 'L', normal: 'N' } })
    expect(large.faces[0]?.imageUrl).toBe('L')
    const normal = normalizeCard({ ...base, image_uris: { normal: 'N' } })
    expect(normal.faces[0]?.imageUrl).toBe('N')
  })

  it('extracts one face per side for double-faced cards', () => {
    const card = normalizeCard({
      ...base,
      name: 'Front // Back',
      layout: 'transform',
      card_faces: [
        { name: 'Front', image_uris: { png: 'https://img/front.png' } },
        { name: 'Back', image_uris: { png: 'https://img/back.png' } }
      ]
    })
    expect(card.faces).toEqual([
      { name: 'Front', imageUrl: 'https://img/front.png' },
      { name: 'Back', imageUrl: 'https://img/back.png' }
    ])
  })

  it('returns no faces when no image is available', () => {
    expect(normalizeCard(base).faces).toEqual([])
  })

  it('defaults oracleId to null when absent', () => {
    const { oracle_id: _oracleId, ...withoutOracle } = base
    expect(normalizeCard(withoutOracle).oracleId).toBeNull()
  })

  it('parses prices from strings and nulls out missing/invalid ones', () => {
    const card = normalizeCard({
      ...base,
      prices: { usd: '1.50', usd_foil: null, eur: '2.00', tix: 'n/a' }
    })
    expect(card.prices.usd).toBe(1.5)
    expect(card.prices.eur).toBe(2)
    expect(card.prices.usdFoil).toBeNull()
    expect(card.prices.tix).toBeNull()
  })

  it('returns all-null prices when the card has none', () => {
    expect(normalizeCard(base).prices).toEqual({
      usd: null,
      usdFoil: null,
      usdEtched: null,
      eur: null,
      eurFoil: null,
      tix: null
    })
  })

  it('defaults relatedTokens to an empty array when all_parts is absent', () => {
    expect(normalizeCard(base).relatedTokens).toEqual([])
  })

  it('extracts only token components from all_parts, excluding the card itself', () => {
    const card = normalizeCard({
      ...base,
      all_parts: [
        {
          id: 'abc-123',
          component: 'combo_piece',
          name: 'Lightning Bolt',
          type_line: 'Instant',
          uri: 'https://api/self'
        },
        {
          id: 'tok-1',
          component: 'token',
          name: 'Goblin',
          type_line: 'Token Creature — Goblin',
          uri: 'https://api/tok-1'
        },
        {
          id: 'tok-emblem',
          component: 'token',
          name: 'Emblem',
          type_line: 'Emblem',
          uri: 'https://api/tok-emblem'
        }
      ]
    })
    expect(card.relatedTokens).toEqual([
      { id: 'tok-1', name: 'Goblin', typeLine: 'Token Creature — Goblin' },
      { id: 'tok-emblem', name: 'Emblem', typeLine: 'Emblem' }
    ])
  })

  it('de-duplicates repeated token ids in all_parts', () => {
    const card = normalizeCard({
      ...base,
      all_parts: [
        { id: 'tok-1', component: 'token', name: 'Goblin', type_line: 'Token', uri: 'u' },
        { id: 'tok-1', component: 'token', name: 'Goblin', type_line: 'Token', uri: 'u' }
      ]
    })
    expect(card.relatedTokens).toEqual([{ id: 'tok-1', name: 'Goblin', typeLine: 'Token' }])
  })
})
