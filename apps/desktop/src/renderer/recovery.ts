import type { RecoveryCopy } from "@parity-app/editor"
import type { DesignStore } from "./design-store.ts"

/** How long after a change its recovery copy is written, so a drag or a run of edits writes once. */
const keepDelayMs = 1000

/**
 * Keeps a project's recovery copy up to date (PAR-905): a moment after its changes change, while any are unsaved, and
 * removed once none are, as after Save or undoing back to what the files hold. It starts once the copy from last time
 * has been offered and answered, so nothing writes over it first.
 */
export interface RecoveryKeeper {
  /** Starts keeping, writing what's unsaved now. */
  start(): void
  /** Writes what's unsaved now, or removes the copy, without waiting: as the app quits. */
  settle(): Promise<void>
  /**
   * Removes the copy and stops keeping, as when the tab closes or quitting discards the changes. One that hasn't started
   * leaves the copy from last time, which nobody has answered yet.
   */
  drop(): Promise<void>
}

export function keepRecovery(
  store: DesignStore,
  keep: (copy: RecoveryCopy | undefined) => Promise<void>,
  delayMs = keepDelayMs
): RecoveryKeeper {
  let started = false
  let stopped = false
  let kept = false
  let written: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  // Saving leaves the revision as it is, so whether anything is unsaved is part of what's written.
  const state = () => `${store.getRevision()} ${store.hasUnsaved()}`

  const write = async (): Promise<void> => {
    clearTimeout(timer)
    timer = undefined

    if (!started || stopped) {
      return
    }

    const now = state()

    if (now === written) {
      return
    }

    written = now
    const copy = store.recoveryCopy()

    if (!copy && !kept) {
      return
    }

    kept = copy !== undefined
    // A copy that can't be kept says so through the service; the canvas carries on without it.
    await keep(copy).catch(() => undefined)
  }

  const unsubscribe = store.subscribe(() => {
    if (started && !stopped && !timer && state() !== written) {
      timer = setTimeout(() => void write(), delayMs)
    }
  })

  return {
    start() {
      started = true
      void write()
    },
    settle: write,
    async drop() {
      const keeping = started && !stopped
      stopped = true
      clearTimeout(timer)
      unsubscribe()

      // Before it started, the copy from last time is still unanswered, so it stays for the next open.
      if (keeping) {
        await keep(undefined).catch(() => undefined)
      }
    }
  }
}
