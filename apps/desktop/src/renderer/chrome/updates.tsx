import type { UpdateState } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { type UpdateNotice, UpdateToast } from "./UpdateToast.tsx"

let state: UpdateState = { phase: "disabled", beta: false }
const listeners = new Set<() => void>()
const notificationId = "parity-update"
let hidden: string | undefined
let foreground = false
let pending: Promise<void> | undefined

/** A single store serves About, Settings and the notification; progress updates replace the same Sonner toast. */
export function receiveUpdate(next: UpdateState): void {
  state = next
  for (const listener of listeners) listener()
  let notice: UpdateNotice | undefined
  if (next.phase === "downloading") notice = { ...next, kind: "downloading" }
  if (next.phase === "ready") notice = { kind: "ready", version: next.version }
  if (next.phase === "manual") notice = { kind: "manual", version: next.version }
  if (foreground && (next.phase === "checking" || next.phase === "current"))
    notice = { kind: next.phase, beta: next.beta }
  if (foreground && next.phase === "error") notice = { kind: "error" }
  if (!notice) {
    hidden = undefined
    toast.dismiss(notificationId)
    return
  }
  const shown = notice
  const key = "version" in shown ? `${shown.kind}:${shown.version}` : shown.kind
  if (hidden === key) return
  toast.custom(
    () => (
      <UpdateToast
        notice={shown}
        onAction={shown.kind === "error" ? checkForUpdates : actOnUpdate}
        onDismiss={() => {
          hidden = key
          toast.dismiss(notificationId)
        }}
      />
    ),
    { id: notificationId, duration: Infinity }
  )
}

export function useUpdates(): UpdateState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => state
  )
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
      if (!received) receiveUpdate(snapshot)
    })
    .catch(() => undefined)
    // The preload queues native-menu actions until this listener exists. Read the initial enabled state first.
    .finally(() => window.canvasHost.updates.onShow(checkForUpdates))
}

export function checkForUpdates(): void {
  hidden = undefined
  foreground = true
  if (["disabled", "downloading", "ready", "manual", "installing"].includes(state.phase)) {
    receiveUpdate(state)
    foreground = false
    return
  }
  receiveUpdate({ phase: "checking", beta: state.beta })
  if (pending) return
  pending = window.canvasHost.updates
    .check()
    .catch(() => {
      receiveUpdate({ phase: "error", beta: state.beta, message: "Couldn't check for updates." })
    })
    .finally(() => {
      foreground = false
      pending = undefined
    })
}

export function actOnUpdate(): void {
  foreground = true
  void window.canvasHost.updates
    .act()
    .catch(() => {
      receiveUpdate({ phase: "error", beta: state.beta, message: "Couldn't open the update." })
    })
    .finally(() => {
      foreground = false
    })
}

export async function setBetaUpdates(beta: boolean): Promise<void> {
  await window.canvasHost.updates.setBeta(beta)
}
