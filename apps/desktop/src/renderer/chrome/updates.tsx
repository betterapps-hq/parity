import type { UpdateState } from "@parity-app/processes"
import { useStore, windowStore } from "../store.ts"
import { notify } from "../toasts.tsx"
import { type UpdateNotice, updateToast } from "./UpdateToast.tsx"

const notificationId = "parity-update"
const state = windowStore<UpdateState>(() => ({ phase: "disabled", beta: false }))
let hidden: string | undefined
let closing = false
let foreground = false
let pending: Promise<void> | undefined

/** Closes the notice because there's nothing to say, which unlike the person closing it doesn't hide it. */
function closeNotification(): void {
  closing = true
  notify.close(notificationId)
  closing = false
}

/** A single store serves About, Settings and the notification; progress updates replace the same toast. */
export function receiveUpdate(next: UpdateState): void {
  state.set(next)

  let notice: UpdateNotice | undefined

  if (foreground && next.phase === "downloading") {
    notice = { ...next, kind: "downloading" }
  }

  if (next.phase === "ready") {
    notice = { kind: "ready", version: next.version }
  }

  if (next.phase === "manual") {
    notice = { kind: "manual", version: next.version }
  }

  if (foreground && (next.phase === "checking" || next.phase === "current")) {
    notice = { kind: next.phase, beta: next.beta }
  }

  if (foreground && next.phase === "error") {
    notice = { kind: "error" }
  }

  if (next.phase !== "checking" && next.phase !== "downloading") {
    foreground = false
  }

  if (!notice) {
    hidden = undefined
    closeNotification()

    return
  }

  const key = "version" in notice ? `${notice.kind}:${notice.version}` : notice.kind

  if (hidden === key) {
    return
  }

  // The same id replaces the notice in place, or shows it fresh when the last one is still animating out.
  const { kind, title, options } = updateToast(notice, notice.kind === "error" ? checkForUpdates : actOnUpdate)
  notify.show(kind, title, {
    ...options,
    id: notificationId,
    timeout: 0,
    // Closed by the person: this notice stays hidden until they check again or there's news.
    onClose: () => {
      if (!closing) {
        hidden = key
      }
    }
  })
}

export function useUpdates(): UpdateState {
  return useStore(state)
}

/** Called once by the app, not by Storybook's stand-in window. Subscribe before reading to avoid a stale initial reply. */
export function startUpdates(): void {
  let received = false
  window.canvasHost.updates.subscribe((next) => {
    received = true
    receiveUpdate(next)
  })
  void window.canvasHost.updates
    .get()
    .then((snapshot) => {
      if (!received) {
        receiveUpdate(snapshot)
      }
    })
    .catch(() => undefined)
    // The preload queues native-menu actions until this listener exists. Read the initial enabled state first.
    .finally(() => window.canvasHost.updates.onShow(checkForUpdates))
}

export function checkForUpdates(): void {
  hidden = undefined
  foreground = true

  const now = state.get()

  if (["disabled", "downloading", "ready", "manual", "installing"].includes(now.phase)) {
    receiveUpdate(now)

    return
  }

  receiveUpdate({ phase: "checking", beta: now.beta })

  if (pending) {
    return
  }

  pending = window.canvasHost.updates
    .check()
    .catch(() => {
      receiveUpdate({ phase: "error", beta: state.get().beta, message: "Couldn't check for updates." })
    })
    .finally(() => {
      pending = undefined
    })
}

export function actOnUpdate(): void {
  foreground = true
  void window.canvasHost.updates
    .act()
    .catch(() => {
      receiveUpdate({ phase: "error", beta: state.get().beta, message: "Couldn't open the update." })
    })
    .finally(() => {
      foreground = false
    })
}

export async function setBetaUpdates(beta: boolean): Promise<void> {
  await window.canvasHost.updates.setBeta(beta)
}
