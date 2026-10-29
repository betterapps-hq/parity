import { defaultModeSettings, resolveModes } from "@parity/core"
import { describe, expect, it } from "vitest"
import { toggleShownMode, withShownModes } from "./view.ts"

const all = resolveModes(defaultModeSettings)
const [desktop, desktopDark, tablet, mobile] = all.map((mode) => mode.id) as [string, string, string, string]

describe("shown modes", () => {
  it("shows a checked mode beside the main frame", () => {
    expect(toggleShownMode(desktop, [desktop], mobile, all)).toEqual({ main: desktop, shown: [desktop, mobile] })
  })

  it("makes the first of the rest main when the main frame is hidden", () => {
    expect(toggleShownMode(tablet, [desktopDark, tablet, mobile], tablet, all)).toEqual({
      main: desktopDark,
      shown: [desktopDark, mobile]
    })
  })

  it("keeps the last frame", () => {
    expect(toggleShownMode(mobile, [mobile], mobile, all)).toEqual({ main: mobile, shown: [mobile] })
  })

  it("writes the main mode down only when it isn't the project's primary one", () => {
    expect(withShownModes({ mode: mobile }, desktop, [mobile, desktop], all)).toEqual({ modes: [mobile] })
    expect(withShownModes({}, tablet, [desktop, tablet], all)).toEqual({ mode: tablet, modes: [desktop] })
  })
})
