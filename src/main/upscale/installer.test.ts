import { describe, expect, it } from 'vitest'
import { assetForPlatform } from './installer'

describe('assetForPlatform', () => {
  it('maps supported platforms to their release asset', () => {
    expect(assetForPlatform('darwin')).toContain('macos')
    expect(assetForPlatform('win32')).toContain('windows')
    expect(assetForPlatform('linux')).toContain('ubuntu')
  })

  it('returns null for unsupported platforms', () => {
    expect(assetForPlatform('aix')).toBeNull()
  })
})
