import { describe, expect, it } from "vite-plus/test"
import { boardSize, companionScale } from "./board.ts"
import type { ContainerSpec } from "./document.ts"
import { defaultModeSettings, resolveModes } from "./modes.ts"

const [desktop, desktopDark, , mobile] = resolveModes(defaultModeSettings)

function design(extra: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: "page",
    name: "Page",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    states: [{ id: "default", name: "Default" }],
    ...extra
  }
}

describe("companionScale", () => {
  it("shrinks companion frames wider than 640 to 640, and leaves narrower ones", () => {
    expect(companionScale(1280)).toBe(0.5)
    expect(companionScale(390)).toBe(1)
  })
})

describe("boardSize", () => {
  it("is the main frame, as tall as its window, inside the board's padding and under its caption", () => {
    // 1 border and 32 padding each side; a 24 caption with 12 below it; a 1280 frame is a laptop's 800 tall.
    expect(boardSize(design(), [desktop!])).toEqual({ width: 1280 + 66, height: 800 + 36 + 66 })
  })

  it("goes by the design's own frame size for the mode's viewport", () => {
    const wide = design({ frames: { desktop: { width: 3000 } } })
    expect(boardSize(wide, [desktop!]).width).toBe(3066)
  })

  it("uses a fixed-height frame's height", () => {
    const fixed = design({ frames: { desktop: { width: 1280, height: 2000 } } })
    expect(boardSize(fixed, [desktop!]).height).toBe(2000 + 36 + 66)
  })

  it("shrinks companion frames as the canvas does, after a divider and gaps", () => {
    // The 1280 companion is drawn at half size, 640 by 400; the 390 phone isn't shrunk, and is the tallest at 844.
    expect(boardSize(design(), [desktop!, desktopDark!, mobile!])).toEqual({
      width: 1280 + 640 + 390 + 2 * 32 + (16 + 1 + 48) + 66,
      height: 844 + 36 + 66
    })
    const fixed = design({ frames: { desktop: { width: 3000, height: 2000 } } })
    // A 3000 by 2000 companion is drawn 640 wide, so 427 tall; the main frame is the taller.
    expect(boardSize(fixed, [mobile!, desktopDark!])).toEqual({
      width: 390 + 640 + 32 + 65 + 66,
      height: 844 + 36 + 66
    })
  })

  it("has a row per state when every state shows, with a divider between rows", () => {
    const states = design({
      states: [
        { id: "default", name: "Default" },
        { id: "error", name: "Error" }
      ],
      view: { allStates: true }
    })
    expect(boardSize(states, [desktop!]).height).toBe(2 * 800 + (48 + 1 + 48) + 36 + 66)
  })
})
