import { recordInterface } from "../interface-events.ts"
import { useStore, windowStore } from "../store.ts"

/** The app's own dialogs, opened from the menus and their shortcuts. One shows at a time. */
export type AppDialog = "settings" | "shortcuts" | "about" | "actions" | "report"

const open = windowStore<AppDialog | undefined>(() => undefined)

export function openDialog(dialog: AppDialog): void {
  if (open.get() !== dialog) {
    recordInterface("dialog.opened", { dialog })
  }

  open.set(dialog)
}

export function closeDialog(): void {
  open.set(undefined)
}

export function useOpenDialog(): AppDialog | undefined {
  return useStore(open)
}
