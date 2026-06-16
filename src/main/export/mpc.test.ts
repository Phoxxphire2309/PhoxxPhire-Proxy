import { describe, expect, it } from 'vitest'
import { mpcBracket } from '@shared/mpc'
import { buildMpcOrderXml, type MpcXmlCard } from './mpc'

describe('mpcBracket', () => {
  it('picks the smallest bracket that fits the quantity', () => {
    expect(mpcBracket(1)).toBe(18)
    expect(mpcBracket(18)).toBe(18)
    expect(mpcBracket(19)).toBe(36)
    expect(mpcBracket(100)).toBe(108)
    expect(mpcBracket(612)).toBe(612)
  })

  it('caps at the largest bracket when the quantity exceeds it', () => {
    expect(mpcBracket(700)).toBe(612)
  })
})

describe('buildMpcOrderXml', () => {
  const cards: MpcXmlCard[] = [
    { fileName: 'lea-161-Lightning_Bolt.png', query: 'Lightning Bolt', slots: [0, 1] },
    {
      fileName: 'mid-50-Front.png',
      query: 'Front // Back',
      slots: [2],
      backFileName: 'mid-50-Front-back.png'
    }
  ]

  it('sums quantity from all slots and computes the bracket', () => {
    const xml = buildMpcOrderXml(cards, 'cardback.png')
    expect(xml).toContain('<quantity>3</quantity>')
    expect(xml).toContain('<bracket>18</bracket>')
    expect(xml).toContain('<stock>(S30) Standard Smooth</stock>')
    expect(xml).toContain('<foil>false</foil>')
  })

  it('emits a front card per entry, with a cards/ id path and basename name', () => {
    const xml = buildMpcOrderXml(cards, 'cardback.png')
    // <id> is a path the MPC Autofill tool resolves on disk; <name> is the basename.
    expect(xml).toContain('<id>cards/lea-161-Lightning_Bolt.png</id>')
    expect(xml).toContain('<name>lea-161-Lightning_Bolt.png</name>')
    expect(xml).toContain('<slots>0,1</slots>')
    expect(xml).toContain('<query>Lightning Bolt</query>')
  })

  it('emits a back entry only for double-faced cards, on the front slots', () => {
    const xml = buildMpcOrderXml(cards, 'cardback.png')
    const backs = xml.slice(xml.indexOf('<backs>'), xml.indexOf('</backs>'))
    expect(backs).toContain('<id>cards/mid-50-Front-back.png</id>')
    expect(backs).toContain('<slots>2</slots>')
    expect(backs).not.toContain('Lightning_Bolt')
  })

  it('references the common cardback as a resolvable cards/ path', () => {
    // A bare filename leaves the cardback unresolved in MPC Autofill; the path fixes it.
    expect(buildMpcOrderXml(cards, 'cardback.png')).toContain(
      '<cardback>cards/cardback.png</cardback>'
    )
  })

  it('escapes XML-sensitive characters in queries and file names', () => {
    const xml = buildMpcOrderXml(
      [{ fileName: 'a&b.png', query: 'Fire // Ice <2>', slots: [0] }],
      'back.png'
    )
    expect(xml).toContain('<id>cards/a&amp;b.png</id>')
    expect(xml).toContain('<query>Fire // Ice &lt;2&gt;</query>')
  })
})
