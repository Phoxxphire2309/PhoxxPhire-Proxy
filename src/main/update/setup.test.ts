import { describe, expect, it } from 'vitest'
import { isNewerVersion } from './setup'

describe('isNewerVersion', () => {
  it('detects a higher version across each component', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true)
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true)
  })

  it('returns false for equal or older versions', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false)
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false)
    expect(isNewerVersion('1.2.0', '1.10.0')).toBe(false) // numeric, not lexical
  })

  it('tolerates a leading v and differing lengths', () => {
    expect(isNewerVersion('v1.2.0', '1.1.9')).toBe(true)
    expect(isNewerVersion('1.1', '1.1.0')).toBe(false)
    expect(isNewerVersion('1.1.1', '1.1')).toBe(true)
  })
})
