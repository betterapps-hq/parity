import { describe, expect, it } from "vite-plus/test"
import { besideScale, boardLayoutAt, boardSize, companionScale } from "./board.ts"
import type { ContainerSpec } from "./document.ts"
import { defaultModeSettings, resolveModes } from "./modes.ts"

const [desktop, desktopDark, , mobile] = resolveModes(defaultModeSettings)

function design(extra: Partial<ContainerSpec> = {}): ContainerSpec {
  return {
    id: "page",
    name: "Page",
    position: { x: 0, y: 0 },
    root: { type: "layout", id: "root", children: [] },
    ...extra
  }
}

describe("companionScale", () => {
  it("shrinks companion frames wider than 640 to 640, and leaves narrower ones", () => {
    expect(companionScale(1280)).toBe(0.5)
    expect(companionScale(390)).toBe(1)
  })
})

/** A board's layout as it shows on screen at a zoom, in screen pixels. */
function onScreen(zoom: number) {
  const { side, caption, between, divider, rowDivider, radius } = boardLayoutAt(zoom)

  return {
    side: side * zoom,
    caption: caption * zoom,
    between: between * zoom,
    divider: [divider.before, divider.line, divider.after].map((space) => space * zoom),
    rowDivider: [rowDivider.before, rowDivider.line, rowDivider.after].map((space) => space * zoom),
    radius: radius * zoom
  }
}

describe("boardLayoutAt", () => {
  it("keeps a board's gutter the same on screen at every zoom up close", () => {
    const screen = {
      side: 12,
      caption: 36,
      between: 24,
      divider: [12, 1, 12],
      rowDivider: [36, 1, 36],
      radius: 10
    }

    for (const zoom of [4, 2, 1, 0.5, 0.4]) {
      expect(onScreen(zoom)).toEqual(screen)
    }

    // At 400% it's a quarter of that on the canvas.
    expect(boardLayoutAt(4)).toMatchObject({ side: 3, caption: 9, between: 6 })
  })

  it("shrinks it with the canvas past 40%, keeping the size it has on the canvas there", () => {
    const far = boardLayoutAt(0.4)
    expect(far).toMatchObject({ side: 30, caption: 90, between: 60 })

    for (const zoom of [0.25, 0.05, 0.01]) {
      expect(boardLayoutAt(zoom)).toEqual(far)
    }

    expect(onScreen(0.25)).toMatchObject({ side: 7.5, caption: 22.5, between: 15 })
    expect(onScreen(0.05)).toMatchObject({ side: 1.5, caption: 4.5, between: 3 })
  })
})

describe("boardSize", () => {
  // Sized as the canvas draws a board at 40% or further out, where its gutter is widest: 30 at each side and the
  // bottom, a 90 caption band on top, 60 between frames, and a dashed line with 30 or 90 either side.
  it("is the main frame, as tall as its window, inside the board's gutter and under its caption band", () => {
    // A 1280 frame is a laptop's 800 tall.
    expect(boardSize(design(), [desktop!])).toEqual({ width: 1280 + 60, height: 90 + 800 + 30 })
  })

  it("goes by the design's own frame size for the mode's viewport", () => {
    const wide = design({ frames: { desktop: { width: 3000 } } })
    expect(boardSize(wide, [desktop!]).width).toBe(3060)
  })

  it("uses a fixed-height frame's height", () => {
    const fixed = design({ frames: { desktop: { width: 1280, height: 2000 } } })
    expect(boardSize(fixed, [desktop!]).height).toBe(90 + 2000 + 30)
  })

  it("shrinks companion frames as the canvas does, after a divider and gaps", () => {
    // The 1280 companion is drawn at half size, 640 by 400; the 390 phone isn't shrunk, and is the tallest at 844. The
    // divider's line is 2.5 wide there, and the size is rounded up.
    expect(boardSize(design(), [desktop!, desktopDark!, mobile!])).toEqual({
      width: Math.ceil(1280 + 640 + 390 + (30 + 2.5 + 30) + 60 + 60),
      height: 90 + 844 + 30
    })
    const fixed = design({ frames: { desktop: { width: 3000, height: 2000 } } })
    // A 3000 by 2000 companion is drawn 640 wide, so 427 tall; the main frame is the taller.
    expect(boardSize(fixed, [mobile!, desktopDark!])).toEqual({
      width: Math.ceil(390 + 640 + 62.5 + 60),
      height: 90 + 844 + 30
    })
  })

  it("draws a companion at the scale its view sets for its mode, and others shrunk to fit", () => {
    const scaled = design({ view: { modes: [desktopDark!.id], scales: { [desktopDark!.id]: 0.25 } } })

    expect(besideScale(scaled, desktopDark!)).toBe(0.25)
    expect(besideScale(scaled, desktop!)).toBe(0.5)
    expect(boardSize(scaled, [mobile!, desktopDark!]).width).toBe(Math.ceil(390 + 320 + 62.5 + 60))
  })

  it("has a row per state when every state shows, with a divider between rows", () => {
    const states = design({
      states: [
        { id: "default", name: "Default" },
        { id: "error", name: "Error" }
      ],
      view: { allStates: true }
    })

    expect(boardSize(states, [desktop!]).height).toBe(Math.ceil(90 + 2 * 800 + (90 + 2.5 + 90) + 30))
  })

  it("is never smaller than the board is drawn at any zoom", () => {
    const states = design({
      states: [
        { id: "default", name: "Default" },
        { id: "error", name: "Error" }
      ],
      view: { allStates: true }
    })

    const size = boardSize(states, [desktop!, mobile!])

    for (const zoom of [4, 1, 0.4, 0.05]) {
      const { side, caption, divider, rowDivider } = boardLayoutAt(zoom)
      const width = 1280 + 390 + divider.before + divider.line + divider.after + 2 * side
      const height = caption + 2 * 844 + rowDivider.before + rowDivider.line + rowDivider.after + side
      expect(size.width).toBeGreaterThanOrEqual(width)
      expect(size.height).toBeGreaterThanOrEqual(height)
    }
  })

  it("draws a frame at its own size, whatever the mode's viewport", () => {
    const frame = design({ kind: "frame", size: { width: 400, height: 300 } })
    expect(boardSize(frame, [desktop!])).toEqual({ width: 400 + 60, height: 90 + 300 + 30 })
    expect(boardSize(frame, [mobile!])).toEqual(boardSize(frame, [desktop!]))
  })
})
