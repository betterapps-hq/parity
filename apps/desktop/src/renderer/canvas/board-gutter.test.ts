import { boardSize, companionScale, defaultModeSettings, resolveModes, type ContainerSpec } from "@parity-app/core"
import { describe, expect, it } from "vite-plus/test"
import { boardParts } from "./board-gutter.ts"

/** A length a part's style gives, in canvas pixels. */
function length(value: string | undefined): number {
  return value ? Number.parseFloat(value) : 0
}

/** The scale a part's transform gives. */
function scaleOf(transform: string | undefined): number {
  return Number(/^scale\((.+)\)$/.exec(transform ?? "")?.[1])
}

describe("boardParts", () => {
  it("keeps a board's gutter its screen size up close: 12 at the sides and bottom, 36 above, 24 between", () => {
    for (const zoom of [4, 1, 0.5]) {
      expect(boardParts.board(zoom).padding).toBe(`0 ${12 / zoom}px ${12 / zoom}px`)
      expect(length(boardParts.firstRow(zoom).paddingTop) * zoom).toBeCloseTo(36)
      expect(length(boardParts.caption(zoom).height) * zoom).toBeCloseTo(36)
      expect(length(boardParts.nextFrame(zoom).marginLeft) * zoom).toBeCloseTo(24)
    }
  })

  it("shrinks it with the canvas past 40%", () => {
    expect(boardParts.board(0.1)).toEqual(boardParts.board(0.4))
    expect(boardParts.board(0.1).padding).toBe("0 30px 30px")
  })

  it("splits the gap before the first companion around a dashed line, and the gap between rows likewise", () => {
    const divided = boardParts.dividedFrame(1)
    expect([length(divided.marginLeft), length(divided.paddingLeft)]).toEqual([12, 1 + 12])
    const row = boardParts.nextRow(1)
    expect([length(row.marginTop), length(row.paddingTop)]).toEqual([36, 1 + 36])
    // A later row's label starts beside its frames, below the line.
    expect(boardParts.nextStateLabel(1).top).toBe(row.paddingTop)
  })

  it("draws dashed lines a screen pixel wide up close, laid out longer and scaled down rather than thinned", () => {
    // At 400% the line is a quarter of a canvas pixel: four times as long, scaled to a quarter.
    expect(boardParts.frameLine(4)).toEqual({ height: "400%", transform: "scale(0.25)" })
    expect(boardParts.rowLine(1)).toEqual({ width: "100%", transform: "scale(1)" })
    // Past 40% it thins with the canvas, as the gutter does.
    expect(scaleOf(boardParts.frameLine(0.1).transform) * 0.1).toBeCloseTo(0.25)
  })

  it("draws the board's edge a screen pixel wide at any zoom, with its corners", () => {
    for (const zoom of [4, 1, 0.1]) {
      const edge = boardParts.edge(zoom)
      expect(scaleOf(edge.transform) * zoom).toBeCloseTo(1)
      expect(length(edge.width) * scaleOf(edge.transform)).toBeCloseTo(100)
      // Its corners, drawn at screen size, round as the board's do.
      expect(length(edge.borderRadius)).toBeCloseTo(length(boardParts.board(zoom).borderRadius) * zoom)
    }
  })

  it("clears what another place in the board set, so a part that moves doesn't keep it", () => {
    for (const part of ["firstFrame", "dividedFrame", "nextFrame"] as const) {
      expect(Object.keys(boardParts[part](1)).toSorted()).toEqual(["marginLeft", "paddingLeft"])
    }
    expect(Object.keys(boardParts.firstRow(1)).toSorted()).toEqual(Object.keys(boardParts.nextRow(1)).toSorted())
    expect(Object.keys(boardParts.firstRowFrames(1))).toEqual(Object.keys(boardParts.nextRowFrames()))
    expect(Object.keys(boardParts.firstStateLabel(1)).toSorted()).toEqual(
      Object.keys(boardParts.nextStateLabel(1)).toSorted()
    )
  })

  it("lays a board out as the agent's estimate of it, at 40% and further out, and smaller closer in", () => {
    const [desktop, , , mobile] = resolveModes(defaultModeSettings)
    const design: ContainerSpec = {
      id: "page",
      name: "Page",
      position: { x: 0, y: 0 },
      root: { type: "layout", id: "root", children: [] },
      states: [
        { id: "default", name: "Default" },
        { id: "error", name: "Error" }
      ],
      view: { allStates: true }
    }
    // A laptop's frame 1280 by 800, then a phone's 390 by 844, and a second laptop's shrunk to half.
    const frames = [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 1280 * companionScale(1280), height: 800 * companionScale(1280) }
    ]
    const drawn = (zoom: number) => {
      const side = length(boardParts.board(zoom).padding?.split(" ")[1])
      const divided = boardParts.dividedFrame(zoom)
      const row = boardParts.nextRow(zoom)
      const width =
        2 * side +
        frames.reduce((total, frame) => total + frame.width, 0) +
        length(divided.marginLeft) +
        length(divided.paddingLeft) +
        length(boardParts.nextFrame(zoom).marginLeft)
      const tallest = Math.max(...frames.map((frame) => frame.height))
      const height =
        length(boardParts.firstRow(zoom).paddingTop) +
        2 * tallest +
        length(row.marginTop) +
        length(row.paddingTop) +
        side
      return { width: Math.ceil(width), height: Math.ceil(height) }
    }
    const estimate = boardSize(design, [desktop!, mobile!, desktop!])
    expect(drawn(0.4)).toEqual(estimate)
    expect(drawn(0.05)).toEqual(estimate)
    expect(drawn(1).width).toBeLessThan(estimate.width)
    expect(drawn(1).height).toBeLessThan(estimate.height)
  })
})
