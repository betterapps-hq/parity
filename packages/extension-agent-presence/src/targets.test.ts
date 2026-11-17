import type { NodeRef } from "@parity-app/extension"
import type { BoxOptions, BoxResult } from "@parity-app/extension/internal"
import { describe, expect, it } from "vite-plus/test"
import type { QueuedStep } from "./queue.ts"
import { designOf, locate, onScreen, type TargetReads } from "./targets.ts"

const drawn = (x: number, y: number, width: number, height: number, radius = 0): BoxResult => ({
  kind: "drawn",
  box: { x, y, width, height },
  radius,
  size: { width: width * 2, height: height * 2 }
})

/** A canvas at 2x, scrolled to (100, 50), 400 by 300 page units in view; boxes by `${key} ${in}`. */
function reads(boxes: Map<string, BoxResult>, asked: string[] = []): TargetReads {
  return {
    view: () => ({ zoom: 2, view: { x: 100, y: 50, width: 400, height: 300 } }),
    box(ref: NodeRef, options?: BoxOptions) {
      const key = `${ref.key} ${options?.in ?? "frame"}${options?.mode ? ` ${options.mode}` : ""}`
      asked.push(key)

      return boxes.get(key) ?? { kind: "missing" }
    }
  }
}

const card = { owner: "design", type: "design", key: "card" }
const row = { owner: "design", type: "frame", key: "card/row" }

describe("where an agent looks", () => {
  it("puts a page box on the screen, from the canvas's top left", () => {
    expect(
      onScreen({ x: 110, y: 60, width: 20, height: 10 }, { zoom: 2, view: { x: 100, y: 50, width: 1, height: 1 } })
    ).toEqual({ x: 20, y: 20, w: 40, h: 20 })
  })

  it("looks at a layer in the frame of its state and mode, with its radius and size", () => {
    const asked: string[] = []
    const step: QueuedStep = { kind: "read", agentId: "a", ref: row, mode: "mobile" }
    const target = locate(reads(new Map([["card/row node mobile", drawn(120, 70, 30, 10, 4)]]), asked), step)

    expect(asked).toEqual(["card board", "card/row node mobile"])
    expect(target?.box()).toEqual({ x: 40, y: 40, w: 60, h: 20 })
    expect(target?.radius()).toBe(8)
    expect(target?.size()).toEqual({ width: 60, height: 20 })
  })

  it("falls back from a layer that isn't drawn to its design's frame, and from a missing frame to the board", () => {
    const frame = locate(reads(new Map([["card frame", drawn(150, 100, 50, 50)]])), {
      kind: "read",
      agentId: "a",
      ref: row
    })

    const boardOnly = locate(reads(new Map([["card board", drawn(140, 90, 60, 60)]])), {
      kind: "read",
      agentId: "a",
      ref: card
    })

    expect(frame?.box()).toEqual({ x: 100, y: 100, w: 100, h: 100 })
    expect(boardOnly?.box()).toEqual({ x: 80, y: 80, w: 120, h: 120 })
  })

  it("drags a moved board by the board itself", () => {
    const asked: string[] = []
    const step: QueuedStep = { kind: "move", agentId: "a", ref: card, from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }

    expect(locate(reads(new Map([["card board", drawn(150, 100, 50, 50)]]), asked), step)).toBeDefined()
    expect(asked).toEqual(["card board"])
  })

  it("points at an asleep frame's box, without a size to label", () => {
    const target = locate(
      reads(new Map([["card frame", { kind: "asleep", frame: { x: 150, y: 100, width: 50, height: 50 } }]])),
      {
        kind: "measure",
        agentId: "a",
        ref: card
      }
    )

    expect(target?.box()).toEqual({ x: 100, y: 100, w: 100, h: 100 })
    expect(target?.size()).toBeUndefined()
    expect(target?.radius()).toBe(0)
  })

  it("skips what's out of view, missing, or names no design", () => {
    expect(
      locate(reads(new Map([["card frame", drawn(900, 100, 50, 50)]])), { kind: "read", agentId: "a", ref: card })
    ).toBe(undefined)
    expect(locate(reads(new Map()), { kind: "read", agentId: "a", ref: card })).toBeUndefined()
    expect(locate(reads(new Map()), { kind: "console", agentId: "a" })).toBeUndefined()
  })

  it("finds a layer's design when the design's key has a slash in it", () => {
    const boxes = new Map([["pages/app.par#card board", drawn(150, 100, 50, 50)]])
    const nested = { owner: "design", type: "frame", key: "pages/app.par#card/row" }

    expect(designOf(reads(boxes), nested)).toBe("pages/app.par#card")
    expect(designOf(reads(new Map()), nested)).toBe("pages")
    expect(designOf(reads(new Map()), card)).toBe("card")
    expect(locate(reads(boxes), { kind: "read", agentId: "a", ref: nested })?.box()).toEqual({
      x: 100,
      y: 100,
      w: 100,
      h: 100
    })
  })

  it("stays where it was when what it looks at goes missing", () => {
    const boxes = new Map([["card frame", drawn(150, 100, 50, 50)]])
    const target = locate(reads(boxes), { kind: "read", agentId: "a", ref: card })
    boxes.delete("card frame")

    expect(target?.box()).toEqual({ x: 100, y: 100, w: 100, h: 100 })
  })
})
