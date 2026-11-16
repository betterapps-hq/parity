import { type ContainerSpec, defaultModeSettings, resolveModes } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { containerModes, withModes } from "./view.ts"

const all = resolveModes(defaultModeSettings)

// SAFETY: the example project has these four modes.
const [desktop, desktopDark, tablet, mobile] = all.map((mode) => mode.id) as [string, string, string, string]

const home = (view: ContainerSpec["view"]): ContainerSpec => ({
  id: "home",
  kind: "screen",
  position: { x: 0, y: 0 },
  name: "Home",
  root: { type: "layout", id: "root", children: [] },
  view
})

describe("shown modes", () => {
  const order = [desktop, desktopDark, tablet, mobile]

  it("shows a mode beside the first one shown, in the design's order", () => {
    expect(withModes({}, order, [desktop, mobile], all)).toEqual({ modes: [mobile] })
  })

  it("draws the first one shown at full size when the first in the list is off, keeping the list's order", () => {
    const view = withModes({}, order, [desktopDark, mobile], all)

    expect(view).toEqual({ mode: desktopDark, modes: [mobile], order })
    expect(containerModes(defaultModeSettings, home(view)).ordered.map((mode) => mode.id)).toEqual(order)
  })

  it("keeps a mode showing, never none", () => {
    expect(withModes({ modes: [mobile] }, order, [], all)).toEqual({ modes: [mobile] })
  })
})

describe("a design's mode order", () => {
  const names = (view: ContainerSpec["view"]) => {
    const { primary, companions, ordered } = containerModes(defaultModeSettings, home(view))

    return {
      first: primary.name,
      beside: companions.map((mode) => mode.name),
      list: ordered.map((mode) => mode.name)
    }
  }

  it("lists its modes in its order, the first shown first and the shown ones beside it in that order", () => {
    const view = withModes({}, [mobile, tablet, desktop, desktopDark], [tablet, mobile, desktop], all)

    expect(view).toEqual({ mode: mobile, modes: [tablet, desktop], order: [mobile, tablet, desktop, desktopDark] })
    expect(names(view)).toEqual({
      first: "Mobile Light",
      beside: ["Tablet Light", "Desktop Light"],
      list: ["Mobile Light", "Tablet Light", "Desktop Light", "Desktop Dark"]
    })
  })

  it("writes nothing down for the project's own order", () => {
    expect(
      withModes({ mode: tablet, order: [tablet] }, [desktop, desktopDark, tablet, mobile], [tablet, desktop], all)
    ).toEqual({
      modes: [tablet]
    })
  })

  it("puts modes the order doesn't name after it, in project order", () => {
    expect(names({ order: [mobile] }).list).toEqual(["Mobile Light", "Desktop Light", "Desktop Dark", "Tablet Light"])
  })
})
