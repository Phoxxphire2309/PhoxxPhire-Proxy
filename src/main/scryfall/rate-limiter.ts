/**
 * Minimum-interval rate limiter.
 *
 * Scryfall asks clients to stay at or below ~10 requests/second and to leave
 * 50–100ms between calls. `acquire()` hands out evenly spaced time slots: each
 * caller computes its slot synchronously (so concurrent callers stagger
 * deterministically) and only then waits for it to arrive.
 */

export interface LimiterClock {
  now(): number
  sleep(ms: number): Promise<void>
}

const realClock: LimiterClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}

export class RateLimiter {
  private nextAllowed = 0

  constructor(
    private readonly minIntervalMs: number,
    private readonly clock: LimiterClock = realClock
  ) {}

  /** Resolves once the caller's spaced time slot has arrived. */
  async acquire(): Promise<void> {
    const now = this.clock.now()
    const start = Math.max(now, this.nextAllowed)
    this.nextAllowed = start + this.minIntervalMs
    const wait = start - now
    if (wait > 0) await this.clock.sleep(wait)
  }

  /** Convenience wrapper: acquire a slot, then run `task`. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    return task()
  }
}
