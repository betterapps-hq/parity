/** Waits for edits to settle before something catches up with them, as the node index does. */
export interface EditSettler {
  /** An edit landed. It settles once edits pause, unless a gesture is open. */
  edited(): void
  /** A gesture opened or ended. While one is open edits wait; when the last ends, waiting edits settle at once. */
  gesture(open: boolean): void
  /** Settles waiting edits now, for a reader about to show what's there. */
  flush(): void
  stop(): void
}

export interface SettleOptions {
  /** How long edits pause before they settle, so a run of separate edits, such as typing, settles once. */
  pause?: number
  /**
   * The longest edits wait, however long a gesture stays open or edits keep coming, so a gesture that's never ended
   * can't hold them for good.
   */
  longest?: number
}

/**
 * Calls `settle` once per settled edit: after a pause in edits, or as soon as a gesture ends, never on each frame of a
 * drag. Edits that land while nothing waits start a wait; those that land meanwhile join it.
 */
export function createEditSettler(
  settle: () => void,
  { pause = 150, longest = 5000 }: SettleOptions = {}
): EditSettler {
  let waiting = false
  let open = false
  let pauseTimer: ReturnType<typeof setTimeout> | undefined
  let longestTimer: ReturnType<typeof setTimeout> | undefined

  const clear = () => {
    clearTimeout(pauseTimer)
    clearTimeout(longestTimer)
    pauseTimer = undefined
    longestTimer = undefined
  }

  const flush = () => {
    if (!waiting) {
      return
    }

    clear()
    waiting = false
    settle()
  }

  return {
    edited() {
      if (!waiting) {
        waiting = true
        longestTimer = setTimeout(flush, longest)
      }

      clearTimeout(pauseTimer)
      pauseTimer = open ? undefined : setTimeout(flush, pause)
    },
    gesture(next) {
      open = next
      clearTimeout(pauseTimer)
      pauseTimer = undefined

      if (!next) {
        flush()
      }
    },
    flush,
    stop() {
      clear()
      waiting = false
    }
  }
}
