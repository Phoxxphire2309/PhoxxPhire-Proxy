import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_EXPORT_OPTIONS } from '@shared/layout'
import { usePageSetupStore } from '@renderer/state/pageSetupStore'

describe('pageSetupStore presets', () => {
  beforeEach(() => {
    usePageSetupStore.setState({ options: DEFAULT_EXPORT_OPTIONS, presets: [] })
  })

  it('saves the current options as a named preset', () => {
    usePageSetupStore.getState().set('scalePercent', 102)
    usePageSetupStore.getState().savePreset('Home inkjet')

    const presets = usePageSetupStore.getState().presets
    expect(presets).toHaveLength(1)
    expect(presets[0]!.name).toBe('Home inkjet')
    expect(presets[0]!.options.scalePercent).toBe(102)
  })

  it('ignores a blank preset name', () => {
    usePageSetupStore.getState().savePreset('   ')
    expect(usePageSetupStore.getState().presets).toHaveLength(0)
  })

  it('overwrites a preset saved under an existing name rather than duplicating', () => {
    usePageSetupStore.getState().set('scalePercent', 100)
    usePageSetupStore.getState().savePreset('Shop')
    usePageSetupStore.getState().set('scalePercent', 98)
    usePageSetupStore.getState().savePreset('Shop')

    const presets = usePageSetupStore.getState().presets
    expect(presets).toHaveLength(1)
    expect(presets[0]!.options.scalePercent).toBe(98)
  })

  it('applies a preset back into the live options', () => {
    usePageSetupStore.getState().set('scalePercent', 105)
    usePageSetupStore.getState().savePreset('Big')
    const id = usePageSetupStore.getState().presets[0]!.id

    usePageSetupStore.getState().set('scalePercent', 100)
    usePageSetupStore.getState().applyPreset(id)
    expect(usePageSetupStore.getState().options.scalePercent).toBe(105)
  })

  it('fills defaults for fields missing from a stored preset', () => {
    // A preset persisted by an older version may lack newer option fields.
    const partial = { scalePercent: 99 } as unknown as typeof DEFAULT_EXPORT_OPTIONS
    usePageSetupStore.setState({
      presets: [{ id: 'p1', name: 'Legacy', options: partial }]
    })
    usePageSetupStore.getState().applyPreset('p1')

    const options = usePageSetupStore.getState().options
    expect(options.scalePercent).toBe(99)
    expect(options.pageSize).toBe(DEFAULT_EXPORT_OPTIONS.pageSize)
  })

  it('deletes a preset by id', () => {
    usePageSetupStore.getState().savePreset('A')
    usePageSetupStore.getState().savePreset('B')
    const [first] = usePageSetupStore.getState().presets
    usePageSetupStore.getState().deletePreset(first!.id)

    const names = usePageSetupStore.getState().presets.map((preset) => preset.name)
    expect(names).toEqual(['B'])
  })
})
