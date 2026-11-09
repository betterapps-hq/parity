/** Something measured from the page (`read`), then acted on (`write`), as `measureTogether` runs it. */
export interface Measure<T> {
  /** Reads the page, and nothing else: nothing when there's nothing to measure. */
  read: () => T | undefined
  /** Acts on what was read, which may change the page. */
  write: (value: T) => void
}

/**
 * Runs measures asked for in the same task together, once it's done: every read, then every write, so the page is laid
 * out once for all of them rather than once each. A board's size, written to its shape, moved the page, so measuring the
 * next board laid it out again: reopening the example project, of 61 boards, laid the page out about 70 times before its
 * first frame showed (PAR-726). The writes run inside `around`, as one change to the canvas. Asking again for the same `owner` before they
 * run replaces its measure; the returned function takes it back.
 */
export function measureTogether(
  around: (writes: () => void) => void = (writes) => writes(),
  schedule: (flush: () => void) => void = queueMicrotask
): <T>(owner: WeakKey, measure: Measure<T>) => () => void {
  // Each measure as its read, which gives back its write.
  const pending = new Map<WeakKey, () => (() => void) | undefined>()

  const flush = () => {
    const reads = [...pending.values()]
    pending.clear()
    const writes = reads.flatMap((read) => read() ?? [])

    if (writes.length > 0) {
      around(() => writes.forEach((write) => write()))
    }
  }

  return (owner, { read, write }) => {
    if (pending.size === 0) {
      schedule(flush)
    }

    const asked = () => {
      const value = read()

      return value === undefined ? undefined : () => write(value)
    }

    pending.set(owner, asked)

    return () => {
      if (pending.get(owner) === asked) {
        pending.delete(owner)
      }
    }
  }
}
