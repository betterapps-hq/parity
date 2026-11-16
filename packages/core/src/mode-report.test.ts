import { describe, expect, it } from "vite-plus/test"
import type { ContainerSpec } from "./document.ts"
import { designModes, modesReport } from "./mode-report.ts"
import { defaultModeSettings, type ModeSettings } from "./modes.ts"

const design: ContainerSpec = {
  id: "home",
  name: "Home",
  position: { x: 0, y: 0 },
  root: { type: "layout", id: "root", name: "Root", children: [] },
  states: [
    { id: "default", name: "Default" },
    { id: "empty", name: "Empty" }
  ]
}

describe("modesReport", () => {
  it("gives viewport ids with the window each stands for, apart from the mode ids renders take", () => {
    const report = modesReport(defaultModeSettings)
    expect(report.viewports).toEqual([
      { id: "desktop", name: "Desktop", width: 1280, height: 800, device: "laptop" },
      { id: "tablet", name: "Tablet", width: 768, height: 1024, device: "tablet" },
      { id: "mobile", name: "Mobile", width: 390, height: 844, device: "phone" }
    ])
    expect(report.modes.map((mode) => mode.id)).toEqual([
      "desktop-light",
      "desktop-dark",
      "tablet-light",
      "mobile-light"
    ])
    expect(report.variables).toEqual(defaultModeSettings.variables)
    expect(report.variables).not.toBe(defaultModeSettings.variables)
  })

  it("resolves each mode: its options, including the defaults it leaves out, and what its theme and locale set", () => {
    const [primary, dark] = modesReport(defaultModeSettings).modes
    expect(primary).toEqual({
      id: "desktop-light",
      name: "Desktop Light",
      primary: true,
      viewport: "desktop",
      width: 1280,
      height: 800,
      values: { viewport: "desktop", theme: "light", locale: "en" },
      classNames: [],
      attributes: { lang: "en", dir: "ltr" }
    })
    expect(dark).toMatchObject({ primary: false, classNames: ["dark"], values: { theme: "dark" } })
  })

  it("takes a device's own screen height over the nearest preset's", () => {
    const settings: ModeSettings = {
      version: 1,
      variables: [
        {
          id: "viewport",
          name: "Viewport",
          kind: "viewport",
          options: [{ id: "phone", name: "Phone", width: 390, height: 700 }]
        }
      ],
      modes: [{ id: "phone", name: "Phone", values: { viewport: "phone" } }]
    }

    const report = modesReport(settings)
    expect(report.viewports[0]).toEqual({ id: "phone", name: "Phone", width: 390, height: 700 })
    expect(report.modes[0]).toMatchObject({ viewport: "phone", width: 390, height: 700, values: { viewport: "phone" } })
  })
})

describe("designModes", () => {
  it("gives the primary mode and the first state when the design picks neither", () => {
    expect(designModes(defaultModeSettings, design)).toEqual({
      id: "home",
      name: "Home",
      state: "default",
      states: ["default"],
      main: "desktop-light",
      beside: []
    })
  })

  it("gives what the board shows, in project order, with each frame's size and window", () => {
    const shown: ContainerSpec = {
      ...design,
      view: { mode: "mobile-light", modes: ["desktop-dark", "missing"], state: "empty", allStates: true },
      frames: { mobile: { width: 390, height: 600 } }
    }

    expect(designModes(defaultModeSettings, shown, true)).toEqual({
      id: "home",
      name: "Home",
      state: "empty",
      states: ["default", "empty"],
      main: "mobile-light",
      beside: ["desktop-dark"],
      frames: [
        { mode: "mobile-light", width: 390, height: 600, window: { width: 390, height: 600 } },
        { mode: "desktop-dark", width: 1280, window: { width: 1280, height: 800 } }
      ]
    })
  })

  it("gives a frame the primary mode alone, at its own size, whatever its view or sizes say", () => {
    // A frame's file has neither, but one held in memory before it's checked still shows only its one frame.
    const frame: ContainerSpec = {
      ...design,
      kind: "frame",
      states: [design.states![0]!],
      size: { width: 400, height: 300 },
      view: { mode: "mobile-light", modes: ["desktop-dark"] },
      frames: { desktop: { width: 1000 } }
    }

    expect(designModes(defaultModeSettings, frame, true)).toEqual({
      id: "home",
      name: "Home",
      state: "default",
      states: ["default"],
      main: "desktop-light",
      beside: [],
      frames: [{ mode: "desktop-light", width: 400, height: 300, window: { width: 400, height: 300 } }]
    })
  })

  it("draws a frame without a width as wide as the primary mode's viewport, growing with its content", () => {
    const frame: ContainerSpec = { ...design, kind: "frame", states: [design.states![0]!] }
    expect(designModes(defaultModeSettings, frame, true).frames).toEqual([
      { mode: "desktop-light", width: 1280, window: { width: 1280, height: 800 } }
    ])
  })
})
