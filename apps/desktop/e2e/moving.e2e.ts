import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, type Box, center } from "./app.ts"

// docs/editor.md, Moving, reordering and resizing (CAN-47): dragging layers, where they land, moving an absolutely
// placed layer, resize handles and duplicating a design, on the example's Dashboard and Calendar.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app.reset())
afterAll(() => app.close())

// Dashboard's four stat cards, in a grid of four columns.
const stats = "i59Du"
const [revenue, users, issues, uptime] = ["VvlPt", "BtvqI", "HwbHH", "PJhCQ"]
const zoom = 0.5

const at = (box: Box, x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y })

describe("dragging a layer in a layout", () => {
  it("moves a stat card right past its neighbour's middle, with a copy where it lands", async () => {
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", users)
    const from = await app.box("Dashboard", users)
    const past = await app.box("Dashboard", issues)
    await app.drag(center(from), [at(past, 0.5, 0.4), at(past, 0.8, 0.3)], async () => {
      await expect
        .poll(() => app.drawn("Dashboard", stats))
        .toEqual([revenue, `hidden:${users}`, issues, "copy", uptime])
    })
    await expect.poll(() => app.children("Dashboard", stats)).toEqual([revenue, issues, users, uptime])
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Dashboard", stats)).toEqual([revenue, users, issues, uptime])
  })

  it("moves a stat card left past its neighbour's middle", async () => {
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", issues)
    const from = await app.box("Dashboard", issues)
    await app.drag(center(from), at(await app.box("Dashboard", revenue), 0.3, 0.7))
    await expect.poll(() => app.children("Dashboard", stats)).toEqual([issues, revenue, users, uptime])
  })

  it("reorders a row of buttons", async () => {
    // Header actions: Export, then New project.
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", "DQRUg")
    const from = await app.box("Dashboard", "DQRUg")
    await app.drag(center(from), at(await app.box("Dashboard", "C7E9z"), 0.8, 0.5))
    await expect.poll(() => app.children("Dashboard", "JWWeK")).toEqual(["C7E9z", "DQRUg"])
  })

  it("swaps a revenue bar past the next one's middle without dropping it inside, though each is a layout", async () => {
    // Revenue bars: a row of month columns, each a layout holding its bar and its label.
    await app.show("Dashboard", zoom)
    const bars = await app.children("Dashboard", "YZrpk")
    const [feb, mar] = [bars[3]!, bars[4]!]
    expect(await app.children("Dashboard", mar)).toHaveLength(2)
    await app.selectLayer("Dashboard", feb)
    const from = await app.box("Dashboard", feb)
    const next = await app.box("Dashboard", mar)
    // Nudged a little, short of the next middle: nothing changes, and there's nothing to undo.
    await app.drag(center(from), { x: center(from).x + 8, y: center(from).y + 2 })
    expect(await app.children("Dashboard", "YZrpk")).toEqual(bars)
    expect(await app.undoLabel()).toBeUndefined()
    await app.drag(center(from), at(next, 0.8, 0.5))
    await expect
      .poll(() => app.children("Dashboard", "YZrpk"))
      .toEqual([...bars.slice(0, 3), mar, feb, ...bars.slice(5)])
    expect(await app.children("Dashboard", mar)).toHaveLength(2)
  })

  it("does nothing when the pointer moves less than the drag threshold", async () => {
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", users)
    const from = center(await app.box("Dashboard", users))
    const during = await app.drag(from, { x: from.x + 2, y: from.y + 2 }, () => app.drawn("Dashboard", stats))
    expect(during).toEqual([revenue, users, issues, uptime])
    expect(await app.children("Dashboard", stats)).toEqual([revenue, users, issues, uptime])
    expect(await app.undoLabel()).toBeUndefined()
    expect((await app.selection()).node).toBe(users)
  })

  it("puts everything back when Escape is pressed mid-drag", async () => {
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", users)
    const from = await app.box("Dashboard", users)
    const past = await app.box("Dashboard", issues)
    await app.drag(center(from), at(past, 0.8, 0.5), async () => {
      await app.page.keyboard.press("Escape")
      await app.frames(2)
    })
    expect(await app.drawn("Dashboard", stats)).toEqual([revenue, users, issues, uptime])
    expect(await app.children("Dashboard", stats)).toEqual([revenue, users, issues, uptime])
    expect(await app.undoLabel()).toBeUndefined()
  })
})

// Calendar's Review slot: placed absolutely in the day's events at top 40, left 0 and right 0, 16 steps high.
const review = "wcc8T"

describe("dragging an absolutely placed layer", () => {
  it("moves both insets of a layer stretched between both sides, in steps", async () => {
    await app.show("Calendar", zoom, review)
    await app.selectLayer("Calendar", review)
    const from = center(await app.box("Calendar", review))
    // 24px of the design to the right is 6 steps.
    await app.drag(from, { x: from.x + 24 * zoom, y: from.y })
    await expect.poll(() => app.style("Calendar", review)).toMatchObject({ top: 40, left: 6, right: -6, height: 16 })
  })

  it("moves a negative inset and sides set by tokens from where they're drawn", async () => {
    // Set up as the hand check was: left -2, and the right and top set to the spacing token.
    await app.page.evaluate((review) => {
      const e2e = window.e2e!
      const key = e2e.key("Calendar")
      e2e.session().store.updateContainer(key, "Set up insets", (container) => {
        const edit = (node: typeof container.root): typeof container.root =>
          node.id === review
            ? { ...node, style: { ...node.style, left: -2, right: "spacing", top: "spacing" } }
            : node.type === "layout"
              ? { ...node, children: node.children.map(edit) }
              : node
        return { ...container, root: edit(container.root) }
      })
    }, review)
    await app.show("Calendar", zoom, review)
    await app.selectLayer("Calendar", review)
    const before = await app.box("Calendar", review)
    await app.drag(center(before), { x: center(before).x + 16 * zoom, y: center(before).y })
    await expect.poll(() => app.style("Calendar", review)).toMatchObject({ top: "spacing", left: 2, right: -3 })
    expect((await app.box("Calendar", review)).width).toBeCloseTo(before.width, 0)
  })
})

describe("resize handles", () => {
  // New project, the last of the header's buttons, at 100% so its side handles have room.
  const button = "C7E9z"

  it("changes only the width with the right handle, in steps, with no hint while dragging", async () => {
    await app.show("Dashboard", 1, button)
    await app.selectLayer("Dashboard", button)
    const box = await app.box("Dashboard", button)
    const handle = { x: box.x + box.width, y: box.y + box.height / 2 }
    // Resting on a handle names it.
    await app.page.mouse.move(handle.x - 1, handle.y)
    await app.page.mouse.move(handle.x, handle.y)
    const hint = app.page.locator("[data-slot=tooltip-content]").filter({ hasText: "Drag to resize" })
    await expect.poll(() => hint.isVisible()).toBe(true)
    const during = await app.drag(handle, { x: handle.x + 48, y: handle.y + 3 }, () => hint.isVisible())
    expect(during).toBe(false)
    await expect.poll(async () => (await app.style("Dashboard", button)).width).toBe(Math.round((box.width + 48) / 4))
    expect((await app.style("Dashboard", button)).height).toBeUndefined()
    expect(await hint.isVisible()).toBe(false)
  })

  it("changes nothing when a side's handle is dragged along its side", async () => {
    await app.show("Dashboard", 1, button)
    await app.selectLayer("Dashboard", button)
    const box = await app.box("Dashboard", button)
    const top = { x: box.x + box.width / 2, y: box.y }
    await app.drag(top, { x: top.x + 50, y: top.y })
    expect(await app.style("Dashboard", button)).toEqual({})
    expect(await app.undoLabel()).toBeUndefined()
  })

  it("moves the top inset with the top handle, keeping the bottom edge", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const box = await app.box("Calendar", review)
    const top = { x: box.x + box.width / 2, y: box.y }
    await app.drag(top, { x: top.x, y: top.y - 16 })
    await expect.poll(() => app.style("Calendar", review)).toMatchObject({ top: 36, height: 20, left: 0, right: 0 })
    const after = await app.box("Calendar", review)
    expect(after.y + after.height).toBeCloseTo(box.y + box.height, 0)
  })

  it("moves only the left inset with the left handle of a stretched layer", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const box = await app.box("Calendar", review)
    const left = { x: box.x, y: box.y + box.height / 2 }
    await app.drag(left, { x: left.x + 12, y: left.y })
    await expect.poll(() => app.style("Calendar", review)).toMatchObject({ left: 3, right: 0, top: 40, height: 16 })
  })
})

describe("duplicating a design", () => {
  it("puts the copy beside the original, past every design in its row, keeping 160px clear", async () => {
    await app.show("Dashboard", 0.1)
    await app.selectDesign("Dashboard")
    const before = await app.designs()
    await app.page.keyboard.press("Control+d")
    await expect.poll(async () => (await app.designs()).length).toBe(before.length + 1)
    const copy = (await app.designs()).find((design) => !before.some((other) => other.key === design.key))!
    expect((await app.selection()).design).toBe(copy.key)
    const bounds = await app.page.evaluate(() => {
      const editor = window.e2e!.session().editor!
      return editor.getCurrentPageShapes().map((shape) => {
        const { minX, minY, maxX, maxY } = editor.getShapePageBounds(shape)!
        return { id: shape.id, minX, minY, maxX, maxY }
      })
    })
    const dashboard = before.find((design) => design.name === "Dashboard")!
    // Top-aligned with the original, to its right.
    expect(copy.position.y).toBe(dashboard.position.y)
    expect(copy.position.x).toBeGreaterThan(dashboard.position.x)
    const mine = bounds.find((shape) => shape.id.endsWith(encodeURIComponent(copy.key)))!
    const near = bounds.filter(
      (other) =>
        other !== mine &&
        other.minX < mine.maxX + 160 &&
        other.maxX + 160 > mine.minX &&
        other.minY < mine.maxY + 160 &&
        other.maxY + 160 > mine.minY
    )
    expect(near).toEqual([])
    await app.page.keyboard.press("Control+z")
    await expect.poll(async () => (await app.designs()).length).toBe(before.length)
  })
})
