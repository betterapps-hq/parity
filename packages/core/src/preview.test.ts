import { describe, expect, it } from "vite-plus/test"
import { boardSize } from "./board.ts"
import { containerSpec, type ContainerSpec } from "./document.ts"
import { defaultModeSettings, resolveModes } from "./modes.ts"
import {
  breakpointAt,
  previewGeometry,
  previewKey,
  previewOf,
  previewOptionsMode,
  previewScale,
  previewValues,
  snapToBreakpoint,
  withoutPreviewValues,
  withPreviewValues
} from "./preview.ts"

const [desktop, desktopDark, , mobile] = resolveModes(defaultModeSettings)
const { variables } = defaultModeSettings

function design(extra: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: "page",
    name: "Page",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    ...extra
  }
}

describe("previewKey", () => {
  it("names a preview by its state and mode, and reads them back", () => {
    expect(previewKey("default", "desktop-light")).toBe("default/desktop-light")
    expect(previewOf("hover/mobile-light")).toEqual({ state: "hover", mode: "mobile-light" })
  })
})

describe("previewOptionsMode", () => {
  it("draws a preview in its own theme and language, keeping its mode's viewport", () => {
    const drawn = previewOptionsMode(desktop!, variables, {
      options: { theme: "dark", locale: "ar", viewport: "mobile" }
    })

    expect(drawn.classNames).toEqual(["dark"])
    expect(drawn.attributes).toEqual({ lang: "ar", dir: "rtl" })
    expect(drawn.viewport).toBe("desktop")
    expect(drawn.width).toBe(1280)
    expect(drawn.id).toBe(desktop!.id)
  })

  it("is the mode itself when the preview sets no options", () => {
    expect(previewOptionsMode(desktopDark!, variables, undefined)).toBe(desktopDark)
    expect(previewOptionsMode(desktopDark!, variables, { width: 900 })).toBe(desktopDark)
  })
})

describe("previewGeometry", () => {
  it("draws a preview at its own width, with the window that width stands for", () => {
    const frame = previewGeometry(design(), desktop!, { width: 700 })

    expect(frame.width).toBe(700)
    expect(frame.viewport.width).toBe(700)
    expect(frame.height).toBeUndefined()
  })

  it("keeps a fixed height and the mode's frame when it sets no width", () => {
    const fixed = design({ frames: { desktop: { width: 1280, height: 800 } } })

    expect(previewGeometry(fixed, desktop!, { width: 500 })).toMatchObject({ width: 500, height: 800 })
    expect(previewGeometry(fixed, desktop!, undefined)).toMatchObject({ width: 1280, height: 800 })
  })
})

describe("previewScale", () => {
  it("is the preview's own scale, else full size first and its column's scale beside it", () => {
    const page = design()

    expect(previewScale(page, desktop!, true, undefined)).toBe(1)
    expect(previewScale(page, desktopDark!, false, undefined)).toBe(0.5)
    expect(previewScale(page, desktopDark!, false, { scale: 2 })).toBe(2)
  })
})

describe("withPreviewValues", () => {
  it("sets a preview's values, and drops them back to its mode's", () => {
    const key = previewKey("default", "desktop-light")
    const set = withPreviewValues({}, key, { width: 900, options: { theme: "dark" } })

    expect(set.previews?.[key]).toEqual({ width: 900, options: { theme: "dark" } })
    expect(previewValues(set.previews?.[key])).toEqual(["width", "option:theme"])

    const narrower = withPreviewValues(set, key, { width: undefined })

    expect(narrower.previews?.[key]).toEqual({ options: { theme: "dark" } })
    expect(withoutPreviewValues(narrower, key, ["option:theme"])).toEqual({})
    expect(withoutPreviewValues(set, key)).toEqual({})
  })

  it("keeps what a design file can hold", () => {
    const view = withPreviewValues({}, "default/desktop-light", { scale: 0.75, width: 390, options: { locale: "ar" } })

    expect(containerSpec.safeParse(design({ view })).success).toBe(true)
  })
})

describe("boardSize with previews", () => {
  it("sizes each row by its own previews", () => {
    const wide = design({ view: { previews: { [previewKey("default", desktop!.id)]: { width: 2000 } } } })

    expect(boardSize(wide, [desktop!]).width).toBeGreaterThan(boardSize(design(), [desktop!]).width + 700)
    expect(boardSize(design(), [desktop!, mobile!]).width).toBeGreaterThan(0)
  })
})

describe("breakpoints", () => {
  const breakpoints = [
    { name: "sm", width: 640 },
    { name: "md", width: 768 },
    { name: "lg", width: 1024 }
  ]

  it("finds the breakpoint a width is at, from where each starts", () => {
    expect(breakpointAt(breakpoints, 500)).toBeUndefined()
    expect(breakpointAt(breakpoints, 768)?.name).toBe("md")
    expect(breakpointAt(breakpoints, 1023)?.name).toBe("md")
    expect(breakpointAt(breakpoints, 3000)?.name).toBe("lg")
  })

  it("lands a width near a breakpoint on it, and leaves one further off", () => {
    expect(snapToBreakpoint(breakpoints, 772, 6)).toBe(768)
    expect(snapToBreakpoint(breakpoints, 780, 6)).toBe(780)
    expect(snapToBreakpoint([], 772, 6)).toBe(772)
  })
})
