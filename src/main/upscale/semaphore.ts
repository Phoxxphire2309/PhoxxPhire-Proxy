/**
 * Async counting semaphore used to cap concurrent upscale processes.
 *
 * Real-ESRGAN is GPU-bound, so running many instances at once thrashes rather
 * than helps. Tasks beyond the limit queue FIFO; a freed slot is handed
 * directly to the next waiter without ever exceeding `max`.
 */
export class Semaphore {
  private active = 0
  private readonly waiters: Array<() => void> = []

  constructor(private readonly max: number) {
    if (max < 1) throw new Error('Semaphore limit must be at least 1')
  }

  private async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    // A released slot was transferred to us, so `active` already accounts for it.
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next) {
      next() // transfer the slot; `active` stays the same
    } else {
      this.active -= 1
    }
  }

  /** Run `task` once a slot is free, releasing the slot when it settles. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }
}
