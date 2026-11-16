import { describe, expect, it } from "vite-plus/test"
import { clip, type SheetInput, sheetLayout, sheetLimit } from "./sheet.ts"

const ready = { id: "ready", name: "Ready" }
const empty = { id: "empty", name: "Empty" }
const desktop = { id: "desktop-light", name: "Desktop light" }
const mobile = { id: "mobile-light", name: "Mobile light" }

function frame(state: SheetInput["state"], mode: SheetInput["mode"], width: number, height: number): SheetInput {
  return { state, mode, width, height }
}

/** Whether two boxes share any area. */
function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

describe("sheetLayout", () => {
  it("puts states in rows and modes in columns, in the order they were drawn", () => {
    const layout = sheetLayout("Bookings", [
      frame(ready, desktop, 640, 400),
      frame(ready, mobile, 375, 600),
      frame(empty, desktop, 640, 300),
      frame(empty, mobile, 375, 500)
    ])

    const [readyDesktop, readyMobile, emptyDesktop, emptyMobile] = layout.frames

    expect(layout.fit).toBe(1)
    expect(readyDesktop!.y).toBe(readyMobile!.y)
    expect(emptyDesktop!.y).toBe(emptyMobile!.y)
    expect(readyDesktop!.x).toBe(emptyDesktop!.x)
    expect(readyMobile!.x).toBeGreaterThan(readyDesktop!.x + 640)
    // A row is as tall as its tallest frame, so the next row starts below the mobile frame.
    expect(emptyDesktop!.y).toBeGreaterThan(readyMobile!.y + 600)
  })

  it("keeps frames apart and inside the sheet", () => {
    const layout = sheetLayout("Bookings", [
      frame(ready, desktop, 640, 400),
      frame(ready, mobile, 375, 600),
      frame(empty, desktop, 640, 300)
    ])

    for (const [index, a] of layout.frames.entries()) {
      expect(a.x + a.width).toBeLessThanOrEqual(layout.width)
      expect(a.y + a.height).toBeLessThanOrEqual(layout.height)

      for (const b of layout.frames.slice(index + 1)) {
        expect(overlaps(a, b)).toBe(false)
      }
    }
  })

  it("labels the design, each mode and each state", () => {
    const { overlay } = sheetLayout("Bookings & payments", [
      frame(ready, desktop, 640, 400),
      frame(empty, mobile, 375, 600)
    ])

    expect(overlay).toContain(">Bookings &amp; payments</text>")
    expect(overlay).toContain(">Desktop light</text>")
    expect(overlay).toContain(">Mobile light</text>")
    expect(overlay).toContain(">Ready</text>")
    expect(overlay).toContain(">Empty</text>")
  })

  it("shrinks the frames to keep the sheet within its limit, and says by how much", () => {
    const states = Array.from({ length: 6 }, (_, index) => ({ id: `s${index}`, name: `State ${index}` }))

    const layout = sheetLayout(
      "Dashboard",
      states.flatMap((state) => [frame(state, desktop, 2560, 1800), frame(state, mobile, 750, 2400)])
    )

    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(sheetLimit)
    expect(layout.fit).toBeLessThan(1)
    expect(layout.frames[0]!.width).toBe(Math.round(2560 * layout.fit))
  })

  it("leaves a cell empty for a state and mode that wasn't drawn", () => {
    const layout = sheetLayout("Bookings", [frame(ready, desktop, 640, 400), frame(empty, mobile, 375, 600)])

    expect(layout.frames).toHaveLength(2)
    expect(layout.frames[1]!.x).toBeGreaterThan(layout.frames[0]!.x)
    expect(layout.frames[1]!.y).toBeGreaterThan(layout.frames[0]!.y)
  })

  it("widens a narrow column to fit its label", () => {
    const layout = sheetLayout("Chip", [frame(ready, desktop, 40, 20), frame(ready, mobile, 40, 20)])

    expect(layout.frames[1]!.x - layout.frames[0]!.x).toBeGreaterThan(40 + 24)
  })
})

describe("clip", () => {
  it("keeps text that fits, and cuts what doesn't with an ellipsis", () => {
    expect(clip("Ready", 200, 14)).toBe("Ready")
    expect(clip("A very long state name that will not fit", 84, 14)).toBe(
      "A very long state name that will not fit".slice(0, 9) + "…"
    )
  })
})
