import { describe, expect, it } from 'vitest'
import { parseDecklist } from './decklist'
import { formatDecklist, type DecklistCard } from './decklistExport'

const make = (over: Partial<DecklistCard>): DecklistCard => ({
  name: 'Lightning Bolt',
  setCode: 'lea',
  collectorNumber: '161',
  quantity: 1,
  section: 'main',
  usd: 1.5,
  ...over
})

describe('formatDecklist', () => {
  it('writes a plain list with no headers for a single section', () => {
    const text = formatDecklist(
      [make({ quantity: 4 }), make({ name: 'Sol Ring', quantity: 1 })],
      'text'
    )
    expect(text).toBe('4 Lightning Bolt\n1 Sol Ring')
  })

  it('adds // section headers when more than one section is used', () => {
    const text = formatDecklist(
      [
        make({ name: 'Krenko, Mob Boss', section: 'commander' }),
        make({ name: 'Mountain', section: 'main', quantity: 30 })
      ],
      'text'
    )
    expect(text).toContain('// Commander')
    expect(text).toContain('// Main deck')
    expect(text).toContain('1 Krenko, Mob Boss')
    expect(text).toContain('30 Mountain')
  })

  it('round-trips through the importer (comments and headers are ignored)', () => {
    const cards = [
      make({ name: 'Krenko, Mob Boss', section: 'commander' }),
      make({ name: 'Lightning Bolt', section: 'main', quantity: 4 })
    ]
    const lines = parseDecklist(formatDecklist(cards, 'text'))
    const names = lines.map((line) => `${line.quantity} ${line.name}`)
    expect(names).toContain('1 Krenko, Mob Boss')
    expect(names).toContain('4 Lightning Bolt')
    expect(lines).toHaveLength(2)
  })

  it('writes MTGA form with set + collector number and Arena headers', () => {
    const mtga = formatDecklist(
      [
        make({ name: 'Sol Ring', setCode: 'c21', collectorNumber: '263', section: 'main' }),
        make({
          name: 'Swords to Plowshares',
          section: 'sideboard',
          setCode: 'sta',
          collectorNumber: '8'
        })
      ],
      'mtga'
    )
    expect(mtga).toContain('Deck\n1 Sol Ring (C21) 263')
    expect(mtga).toContain('Sideboard\n1 Swords to Plowshares (STA) 8')
  })

  it('MTGA output re-imports with exact printings preserved', () => {
    const lines = parseDecklist(
      formatDecklist([make({ name: 'Sol Ring', setCode: 'c21', collectorNumber: '263' })], 'mtga')
    )
    expect(lines[0]).toMatchObject({ name: 'Sol Ring', setCode: 'C21', collectorNumber: '263' })
  })

  it('writes CSV with a header, prices, and totals', () => {
    const csv = formatDecklist([make({ quantity: 4, usd: 1.5 })], 'csv')
    const [header, row] = csv.split('\n')
    expect(header).toBe('Quantity,Name,Set,Collector Number,Section,Unit Price (USD),Total (USD)')
    expect(row).toBe('4,Lightning Bolt,LEA,161,Main deck,1.50,6.00')
  })

  it('quotes CSV fields containing commas and leaves missing prices blank', () => {
    const csv = formatDecklist(
      [make({ name: 'Tibalt, Cosmic Impostor', usd: null, quantity: 1 })],
      'csv'
    )
    const row = csv.split('\n')[1]!
    expect(row).toContain('"Tibalt, Cosmic Impostor"')
    expect(row.endsWith(',,')).toBe(true) // empty unit + total prices
  })
})
