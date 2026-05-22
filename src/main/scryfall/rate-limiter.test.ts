import { describe, expect, it } from 'vitest'
import { RateLimiter, type LimiterClock } from './rate-limiter'

/** Virtual clock: `sleep` advances time instantly, so tests stay deterministic. */
class FakeClock implements LimiterClock {
  current = 0
  now(): number {
    return this.current
  }
  async sleep(ms: number): Promise<void> {
    this.current += ms
  }
}

describe('RateLimiter', () => {
  it('does not delay the first acquisition', async () => {
    const clock = new FakeClock()
    const limiter = new RateLimiter(100, clock)
    await limiter.acquire()
    expect(clock.now()).toBe(0)
  })

  it('spaces sequential acquisitions by the minimum interval', async () => {
    const clock = new FakeClock()
    const limiter = new RateLimiter(100, clock)
    const starts: number[] = []
    for (let i = 0; i < 4; i += 1) {
      await limiter.acquire()
      starts.push(clock.now())
    }
    expect(starts).toEqual([0, 100, 200, 300])
  })

  it('does not over-throttle when callers arrive slower than the interval', async () => {
    const clock = new FakeClock()
    const limiter = new RateLimiter(100, clock)
    await limiter.acquire()
    clock.current = 500 // caller comes back well after the slot
    await limiter.acquire()
    expect(clock.now()).toBe(500)
  })

  it('run() executes the task after acquiring a slot', async () => {
    const limiter = new RateLimiter(0, new FakeClock())
    const value = await limiter.run(async () => 42)
    expect(value).toBe(42)
  })

  it('spaces real-time acquisitions using the default clock', async () => {
    const limiter = new RateLimiter(5) // real wall-clock sleep
    const start = Date.now()
    await limiter.acquire()
    await limiter.acquire()
    expect(Date.now() - start).toBeGreaterThanOrEqual(4)
  })
})
