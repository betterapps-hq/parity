import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { SettingsOpening } from "../../shared/settings-view.ts"
import { resetWindowStores } from "../store.ts"
import { openDialog } from "./app-dialogs.ts"
import { drawSettingsInPage, openSettings, settingsOpening } from "./open-settings.ts"

vi.mock("./app-dialogs.ts", () => ({ openDialog: vi.fn<(dialog: string) => void>() }))

/** Main, as far as opening Settings goes: what the window asked it to show. */
function main() {
  const asked: SettingsOpening[] = []
  vi.stubGlobal("window", {
    canvasHost: {
      settingsView: {
        open: (opening: SettingsOpening) => {
          asked.push(opening)

          return Promise.resolve()
        }
      }
    }
  })

  return asked
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(openDialog).mockClear()
  resetWindowStores()
})

describe("openSettings", () => {
  it("asks main for its Settings view in the app, as File > Settings and Ctrl+, do (PAR-1138)", () => {
    const asked = main()

    openSettings()
    openSettings("shortcuts", "key:undo")

    expect(asked).toEqual([{}, { page: "shortcuts", setting: "key:undo" }])
    expect(openDialog).not.toHaveBeenCalled()
  })

  it("opens the page's own Settings where the page draws it, as Storybook does", () => {
    const asked = main()
    const stop = drawSettingsInPage()

    openSettings("diagnostics")

    expect(asked).toEqual([])
    expect(openDialog).toHaveBeenCalledWith("settings")
    expect(settingsOpening.get()).toEqual({ page: "diagnostics", setting: undefined })

    stop()
  })
})
