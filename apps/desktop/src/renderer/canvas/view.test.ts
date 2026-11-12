import { type ContainerSpec, defaultModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { containerModes, toggleShownMode, withModeOrder, withShownModes } from "./view.ts"

const all = resolveModes(defaultModeSettings)

// SAFETY: the example project has these four modes.
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

describe("a design's mode order", () => {
  const screen = (view: ContainerSpec["view"]): ContainerSpec => ({
    id: "home",
    kind: "screen",
    position: { x: 0, y: 0 },
    name: "Home",
    root: { type: "layout", id: "root", children: [] },
    view
  })

  const names = (view: ContainerSpec["view"]) => {
    const { primary, companions, ordered } = containerModes(defaultModeSettings, screen(view))

    return {
      first: primary.name,
      beside: companions.map((mode) => mode.name),
      list: ordered.map((mode) => mode.name)
    }
  }

  it("lists its modes in its order, the first shown first and the shown ones beside it in that order", () => {
    const view = withModeOrder({ modes: [tablet] }, [mobile, tablet, desktop, desktopDark], all)

    expect(view).toEqual({ mode: mobile, modes: [tablet, desktop], order: [mobile, tablet, desktop, desktopDark] })
    expect(names(view)).toEqual({
      first: "Mobile Light",
      beside: ["Tablet Light", "Desktop Light"],
      list: ["Mobile Light", "Tablet Light", "Desktop Light", "Desktop Dark"]
    })
  })

  it("shows the mode that was first beside the one moved first, which always shows", () => {
    expect(withModeOrder({ modes: [tablet, mobile] }, [tablet, desktop, desktopDark, mobile], all).modes).toEqual([
      mobile,
      desktop
    ])
  })

  it("writes nothing down for the project's own order", () => {
    expect(withModeOrder({ mode: tablet, order: [tablet] }, [desktop, desktopDark, tablet, mobile], all)).toEqual({
      modes: [tablet]
    })
  })

  it("puts modes the order doesn't name after it, in project order", () => {
    expect(names({ order: [mobile] }).list).toEqual(["Desktop Light", "Mobile Light", "Desktop Dark", "Tablet Light"])
  })
})
