import { describe, expect, it } from 'vitest'
import { Semaphore } from './semaphore'

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('Semaphore', () => {
  it('rejects a limit below 1', () => {
    expect(() => new Semaphore(0)).toThrow()
  })

  it('never exceeds the configured concurrency', async () => {
    const semaphore = new Semaphore(2)
    let active = 0
    let peak = 0
    const gates = [deferred(), deferred(), deferred(), deferred()]

    const runs = gates.map((gate) =>
      semaphore.run(async () => {
        active += 1
        peak = Math.max(peak, active)
        await gate.promise
        active -= 1
      })
    )

    // Two should be running; the rest queued.
    await Promise.resolve()
    expect(peak).toBe(2)

    gates.forEach((gate) => gate.resolve())
    await Promise.all(runs)
    expect(peak).toBe(2)
    expect(active).toBe(0)
  })

  it('returns the task result and releases the slot on failure', async () => {
    const semaphore = new Semaphore(1)
    await expect(semaphore.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom'
    )
    // If the slot was released, this resolves rather than deadlocks.
    await expect(semaphore.run(async () => 'ok')).resolves.toBe('ok')
  })
})
