import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_MODEL, DEFAULT_SCALE } from './paths'
import { buildArgs, Upscaler } from './upscaler'

describe('buildArgs', () => {
  it('builds the expected realesrgan-ncnn-vulkan invocation with defaults', () => {
    const args = buildArgs({ inputPath: 'in.png', outputPath: 'out.png' }, '/models')
    expect(args).toEqual([
      '-i',
      'in.png',
      '-o',
      'out.png',
      '-s',
      String(DEFAULT_SCALE),
      '-n',
      DEFAULT_MODEL,
      '-m',
      '/models',
      '-f',
      'png'
    ])
  })

  it('honours custom scale and model', () => {
    const args = buildArgs(
      { inputPath: 'in.png', outputPath: 'out.png', scale: 2, model: 'realesrnet-x4plus' },
      '/models'
    )
    expect(args).toContain('2')
    expect(args).toContain('realesrnet-x4plus')
  })
})

/** Minimal fake child process exposing the events the Upscaler listens for. */
function fakeChild(): EventEmitter & { stderr: EventEmitter; kill: () => void } {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; kill: () => void }
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('Upscaler.run', () => {
  it('resolves when the process exits with code 0', async () => {
    const child = fakeChild()
    const spawnFn = vi.fn(() => child) as never
    const upscaler = new Upscaler({ binaryPath: 'bin', modelsDir: 'm', spawnFn })

    const done = upscaler.run({ inputPath: 'in.png', outputPath: 'out.png' })
    child.emit('close', 0)
    await expect(done).resolves.toBeUndefined()
    expect(spawnFn).toHaveBeenCalledWith('bin', expect.arrayContaining(['-i', 'in.png']))
  })

  it('rejects with stderr context on a non-zero exit', async () => {
    const child = fakeChild()
    const upscaler = new Upscaler({
      binaryPath: 'bin',
      modelsDir: 'm',
      spawnFn: (() => child) as never
    })

    const done = upscaler.run({ inputPath: 'in.png', outputPath: 'out.png' })
    child.stderr.emit('data', Buffer.from('vulkan error'))
    child.emit('close', 1)
    await expect(done).rejects.toThrow(/code 1.*vulkan error/s)
  })

  it('rejects and kills the process on timeout', async () => {
    vi.useFakeTimers()
    const child = fakeChild()
    const upscaler = new Upscaler({
      binaryPath: 'bin',
      modelsDir: 'm',
      timeoutMs: 50,
      spawnFn: (() => child) as never
    })

    const done = upscaler.run({ inputPath: 'in.png', outputPath: 'out.png' })
    const assertion = expect(done).rejects.toThrow(/timed out/)
    await vi.advanceTimersByTimeAsync(60)
    await assertion
    expect(child.kill).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
