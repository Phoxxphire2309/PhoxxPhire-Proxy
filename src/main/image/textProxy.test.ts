import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { renderTextProxy } from './textProxy'

const isPng = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47

describe('renderTextProxy', () => {
  it('renders a card-sized PNG from oracle data', async () => {
    const out = await renderTextProxy({
      name: 'Lightning Bolt',
      manaCost: '{R}',
      typeLine: 'Instant',
      oracleText: 'Lightning Bolt deals 3 damage to any target.',
      setCode: 'lea',
      collectorNumber: '161'
    })
    expect(isPng(out)).toBe(true)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(745)
    expect(meta.height).toBe(1040)
  })

  it('handles a creature with power/toughness and a long multi-paragraph text', async () => {
    const out = await renderTextProxy({
      name: 'Some Big Creature',
      manaCost: '{4}{G}{G}',
      typeLine: 'Creature — Beast',
      oracleText:
        'Trample\nWhen this enters, draw a card.\nWhenever this attacks, it gets +1/+1 until end of turn for each other attacking creature.',
      power: '6',
      toughness: '6'
    })
    expect(isPng(out)).toBe(true)
    expect((await sharp(out).metadata()).height).toBe(1040)
  })

  it('renders even with no oracle text or cost', async () => {
    const out = await renderTextProxy({ name: 'Forest', typeLine: 'Basic Land — Forest' })
    expect(isPng(out)).toBe(true)
  })
})
