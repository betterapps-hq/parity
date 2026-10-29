import { useSyncExternalStore } from "react"

/** The app's own dialogs, opened from the menus and their shortcuts. One shows at a time. */
export type AppDialog = "settings" | "shortcuts" | "about" | "actions"

let open: AppDialog | undefined
const listeners = new Set<() => void>()

export function openDialog(dialog: AppDialog): void {
  open = dialog
  for (const listener of listeners) listener()
}

export function closeDialog(): void {
  open = undefined
  for (const listener of listeners) listener()
}

export function useOpenDialog(): AppDialog | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => open
  )
}
