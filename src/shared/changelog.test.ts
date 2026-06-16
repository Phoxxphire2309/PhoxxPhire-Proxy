import { describe, expect, it } from 'vitest'
import { CHANGELOG, LATEST_VERSION } from '@shared/changelog'

describe('changelog', () => {
  it('has at least one version and every entry is well-formed', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0)
    for (const entry of CHANGELOG) {
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+/)
      expect(entry.highlights.length).toBeGreaterThan(0)
      expect(entry.highlights.every((h) => h.trim().length > 0)).toBe(true)
    }
  })

  it('exposes the newest version as LATEST_VERSION', () => {
    expect(LATEST_VERSION).toBe(CHANGELOG[0]!.version)
  })
})
