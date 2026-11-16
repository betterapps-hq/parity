import type { CloseReplies } from "./host-handlers.ts"
import type { UpdateSession } from "./update-session.ts"

/** What the close flow needs of an app window: Electron's `BrowserWindow` in the app, a fake in tests. */
export interface ClosingWindow {
  readonly id: number
  /** Whether its page crashed, so it can't answer. */
  crashed(): boolean
  destroyed(): boolean
  /** Asks its page whether the window may close, which the page answers through `CloseReplies`. */
  ask(): void
  close(): void
  /** Calls `listener` as the window is about to close, with what keeps it open. */
  onClose(listener: (keepOpen: () => void) => void): void
  onClosed(listener: () => void): void
}

export interface CloseFlowOptions {
  /** Quits the app, once the window closing as it quits has. */
  quit: () => void
  /** The update session, once the app is ready, which a restart for an update installs through. */
  updates: () => Pick<UpdateSession, "install" | "fail"> | undefined
  /** Notes that a quit was called off, for telemetry. */
  quitCancelled: () => void
  /** How long a page has to say it's deciding before its window closes anyway. */
  answerMs?: number
}

/** Closing a window, quitting, and restarting to install an update, each of which the window's page decides on. */
export interface CloseFlow {
  /** Takes over `window`'s close, so its page decides whether it closes. */
  watch(window: ClosingWindow): void
  /** What `window`'s page's close methods reach, while it's open. */
  replies(windowId: number): CloseReplies | undefined
  /** Closes `window` to install the update that's downloaded, once its page says it may. */
  restartForUpdate(window: Pick<ClosingWindow, "id" | "close">): void
  /** Notes that the app is quitting, as Electron's `before-quit` says. */
  quitStarted(): void
  /** Whether the app is quitting: asked to, and not called off. */
  quitting(): boolean
}

/**
 * The page decides whether its window closes: it may ask about unsaved changes first, or finish saving. It answers at
 * once that it's deciding; a page that doesn't (hung or still loading) doesn't keep the window open past `answerMs`. A
 * window closing as the app quits quits it once it's closed, and one closing for an update installs it instead.
 */
export function createCloseFlow({ quit, updates, quitCancelled, answerMs = 3000 }: CloseFlowOptions): CloseFlow {
  let quitting = false
  /** Windows closing to install an update, by id. */
  const updateRestarts = new Set<number>()
  const replies = new Map<number, CloseReplies>()

  return {
    watch(window) {
      let ready = false
      let deciding = false
      /** Notes that the page answered the close it's being asked about now. */
      let acknowledge: (() => void) | undefined

      const callOff = () => {
        deciding = false
        quitting = false
        quitCancelled()
      }

      const closeNow = () => {
        ready = true
        window.close()

        if (quitting) {
          quit()
        }
      }

      window.onClose((keepOpen) => {
        if (ready || window.crashed()) {
          return
        }

        keepOpen()

        if (deciding) {
          return
        }

        deciding = true
        let acknowledged = false
        acknowledge = () => {
          acknowledged = true
        }

        window.ask()
        setTimeout(() => {
          if (acknowledged || ready || window.destroyed()) {
            return
          }

          if (updateRestarts.delete(window.id)) {
            deciding = false
            updates()?.fail(new Error("The window did not answer. Try restarting the update again."))

            return
          }

          closeNow()
        }, answerMs)
      })

      replies.set(window.id, {
        pending: () => acknowledge?.(),
        cancel: () => {
          updateRestarts.delete(window.id)
          callOff()
        },
        ready: () => {
          if (ready) {
            return
          }

          if (updateRestarts.delete(window.id)) {
            ready = true

            const resetClose = () => {
              ready = false
              callOff()
            }

            if (!updates()?.install(resetClose)) {
              resetClose()
            }

            return
          }

          closeNow()
        }
      })

      window.onClosed(() => {
        replies.delete(window.id)
        updateRestarts.delete(window.id)
      })
    },
    replies: (windowId) => replies.get(windowId),
    restartForUpdate(window) {
      updateRestarts.add(window.id)
      window.close()
    },
    quitStarted() {
      quitting = true
    },
    quitting: () => quitting
  }
}
