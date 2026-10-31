import type { UpdateState } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { openDialog } from "./app-dialogs.ts"
import { type UpdateNotice, UpdateToast } from "./UpdateToast.tsx"

let state: UpdateState = { phase: "disabled", beta: false }
const listeners = new Set<() => void>()
const notificationId = "parity-update"
let hidden: string | undefined

/** A single store serves About, Settings and the notification; progress updates replace the same Sonner toast. */
export function receiveUpdate(next: UpdateState): void {
  state = next
  for (const listener of listeners) listener()
  let notice: UpdateNotice | undefined
  if (next.phase === "downloading") notice = { ...next, kind: "downloading" }
  if (next.phase === "ready") notice = { kind: "ready", version: next.version }
  if (next.phase === "manual") notice = { kind: "manual", version: next.version }
  if (!notice) {
    hidden = undefined
    toast.dismiss(notificationId)
    return
  }
  const shown = notice
  const key = `${shown.kind}:${shown.version}`
  if (hidden === key) return
  toast.custom(
    () => (
      <UpdateToast
        notice={shown}
        onAction={actOnUpdate}
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
  window.canvasHost.updates.onShow(checkForUpdates)
}

export function checkForUpdates(): void {
  openDialog("about")
  void window.canvasHost.updates.check().catch(() => {
    receiveUpdate({ phase: "error", beta: state.beta, message: "Couldn't check for updates." })
  })
}

export function actOnUpdate(): void {
  void window.canvasHost.updates.act().catch(() => {
    receiveUpdate({ phase: "error", beta: state.beta, message: "Couldn't open the update." })
  })
}

export async function setBetaUpdates(beta: boolean): Promise<void> {
  await window.canvasHost.updates.setBeta(beta)
}
