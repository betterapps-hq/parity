/** Closes something once nothing has used it for a while, and lets each use say when it begins and ends. */
export interface IdleClose {
  /**
   * Marks a use as begun, from the moment it's asked for, so one that's waiting its turn holds it open too. Call the
   * function it returns when the use ends; the wait starts again once the last one has.
   */
  use(): () => void
  /** Forgets a close that's waiting, as when the thing was closed some other way. */
  cancel(): void
}

/**
 * Calls `close` once `idleMs` pass with nothing using it: never during a use or while one waits, and only once for each
 * time it falls idle. The offscreen renderer closes this way, since its page and the project's modules it imported hold
 * memory that only closing it returns.
 */
export function idleClose(idleMs: number, close: () => void): IdleClose {
  let using = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
  }
  return {
    use() {
      using++
      cancel()
      let ended = false
      return () => {
        if (ended) return
        ended = true
        using--
        if (using > 0) return
        timer = setTimeout(() => {
          timer = undefined
          close()
        }, idleMs)
      }
    },
    cancel
  }
}
