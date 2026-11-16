import type { SettingsOpening } from "../../shared/settings-view.ts"
import { windowStore } from "../store.ts"
import { openDialog } from "./app-dialogs.ts"

/*
 * Opening Settings, from File > Settings, Ctrl+, or a link to a setting. In the app it's its own web contents over the
 * window, owned by main, which loads no project code (PAR-1090), so this asks main to show it. Storybook draws Settings
 * in the page itself, with `SettingsDialog`, which says so with `drawSettingsInPage`. Apart from `SettingsDialog`, so
 * the actions can open Settings without importing what it draws.
 */

/** Where Settings opens: a page, and a setting on it to mark. */
export interface Opening {
  page?: string
  setting?: string
}

/** Where the in-page Settings opens, as Storybook draws it. */
export const settingsOpening = windowStore<Opening>(() => ({}))

/** Whether Settings is drawn in this page, as Storybook draws it, rather than as main's own view. */
let inPage = false

/** Says Settings is drawn in this page from now on, until the function this gives is called. */
export function drawSettingsInPage(): () => void {
  inPage = true

  return () => {
    inPage = false
  }
}

/** Opens Settings, on a page and with a setting on it marked when asked, as a link to a setting does. */
export function openSettings(page?: string, setting?: string): void {
  if (inPage) {
    settingsOpening.set({ page, setting })
    openDialog("settings")

    return
  }

  const asked: SettingsOpening = {}

  if (page !== undefined) {
    asked.page = page
  }

  if (setting !== undefined) {
    asked.setting = setting
  }

  void window.canvasHost.settingsView.open(asked).catch(() => undefined)
}
