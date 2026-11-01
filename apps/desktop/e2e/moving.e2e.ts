import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, type Box, center } from "./app.ts"

// docs/editor.md, Moving, reordering and resizing (CAN-47, PAR-193): dragging layers, where they land, moving an
// absolutely placed layer, resize handles, empty layouts, cursors and Escape during a gesture, and duplicating a design,
// on the example's Dashboard and Calendar.

let app: App

beforeAll(async () => {
  app = await App.connect()
})
afterEach(() => app?.reset())
afterAll(() => app?.close())

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
        const edit = (node: typeof container.root): typeof container.root => {
          if (node.id === review)
            return { ...node, style: { ...node.style, left: -2, right: "spacing", top: "spacing" } }
          return node.type === "layout" ? { ...node, children: node.children.map(edit) } : node
        }
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

  it("takes the whole resize back when Escape is pressed mid-drag, leaving nothing to undo (PAR-193)", async () => {
    await app.show("Dashboard", 1, button)
    await app.selectLayer("Dashboard", button)
    const box = await app.box("Dashboard", button)
    const handle = { x: box.x + box.width, y: box.y + box.height / 2 }
    // Slowly, in two moves, so the drag writes more than once on its way.
    await app.drag(
      handle,
      [
        { x: handle.x + 24, y: handle.y },
        { x: handle.x + 48, y: handle.y }
      ],
      async () => {
        await expect.poll(async () => (await app.style("Dashboard", button)).width).toBeDefined()
        await app.page.keyboard.press("Escape")
        await app.frames(2)
      }
    )
    expect(await app.style("Dashboard", button)).toEqual({})
    expect(await app.undoLabel()).toBeUndefined()
    expect((await app.box("Dashboard", button)).width).toBeCloseTo(box.width, 0)
    // Escape went to the resize alone: the button is still selected, rather than its parent.
    expect((await app.selection()).node).toBe(button)
  })

  it("sits outside a layer under 24px, so a press just inside its edge drags it (PAR-193)", async () => {
    // At 50%, New project is 16px high, so its top and bottom handles and its corners sit above and below it.
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", button)
    const box = await app.box("Dashboard", button)
    expect(box.height).toBeLessThan(24)
    const handles = await app.handles()
    expect(handles).toHaveLength(8)
    const inside = handles.filter(
      (handle) =>
        handle.y < box.y + box.height - 0.5 &&
        handle.y + handle.height > box.y + 0.5 &&
        handle.x < box.x + box.width - 0.5 &&
        handle.x + handle.width > box.x + 0.5
    )
    // Only the left and right strips, which straddle the button's ends as on any layer wide enough.
    expect(inside).toHaveLength(2)
    for (const handle of inside) expect(handle.width).toBeLessThanOrEqual(8)
    // A press 3px inside its top edge, where its top handle was, moves it past Export.
    const from = { x: box.x + box.width / 2, y: box.y + 3 }
    await app.drag(from, at(await app.box("Dashboard", "DQRUg"), 0.2, 0.5))
    await expect.poll(() => app.children("Dashboard", "JWWeK")).toEqual(["C7E9z", "DQRUg"])
    expect((await app.style("Dashboard", button)).height).toBeUndefined()
  })
})

describe("empty layouts (PAR-193)", () => {
  /** Puts an empty row at the end of the header's actions, after New project, as an edit Undo takes back. */
  async function addEmptyRow(): Promise<void> {
    await app.page.evaluate(() => {
      const e2e = window.e2e!
      const key = e2e.key("Dashboard")
      e2e.session().store.updateContainer(key, "Add an empty row", (container) => {
        const edit = (node: typeof container.root): typeof container.root => {
          if (node.type !== "layout") return node
          const children = node.children.map(edit)
          if (node.id === "JWWeK")
            children.push({ type: "layout", id: "empty", style: { direction: "row" }, children: [] })
          return { ...node, children }
        }
        return { ...container, root: edit(container.root) }
      })
    })
  }

  it("have a size of their own, and are selected by a click", async () => {
    await addEmptyRow()
    await app.show("Dashboard", 1, "empty")
    const size = await app.size("Dashboard", "empty")
    expect(size?.width).toBe(24)
    expect(size?.height).toBeGreaterThanOrEqual(24)
    await app.selectLayer("Dashboard", "empty")
    expect((await app.selection()).node).toBe("empty")
  })

  it("take a layer dropped anywhere on them", async () => {
    await addEmptyRow()
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", users)
    // 6px in from its left edge, which is half its least size at 50%: a layout drawn with no width has nothing there.
    const empty = await app.box("Dashboard", "empty")
    await app.drag(center(await app.box("Dashboard", users)), { x: empty.x + 6, y: empty.y + empty.height / 2 })
    await expect.poll(() => app.children("Dashboard", "empty")).toEqual([users])
    expect(await app.children("Dashboard", stats)).toEqual([revenue, issues, uptime])
  })
})

/** Where a design's title is, which a press drags it by. */
async function titleOf(design: string): Promise<Box> {
  const box = await app.page
    .locator(".design-title > div > button")
    .filter({ hasText: new RegExp(`^${design}$`) })
    .boundingBox()
  if (!box) throw new Error(`${design}'s title isn't drawn`)
  return box
}

describe("dragging a design by its title", () => {
  /** Where tldraw has the design's board on the page. */
  async function board(design: string): Promise<{ x: number; y: number }> {
    const key = await app.key(design)
    return app.page.evaluate((key) => {
      const shape = window
        .e2e!.session()
        .editor!.getCurrentPageShapes()
        .find((candidate) => candidate.id.endsWith(encodeURIComponent(key)))
      if (!shape) throw new Error(`No board for ${key}`)
      return { x: shape.x, y: shape.y }
    }, key)
  }

  it("puts the design back when Escape is pressed mid-drag, saving nothing (PAR-193)", async () => {
    await app.show("Dashboard", zoom)
    const before = (await app.designs()).find((design) => design.name === "Dashboard")!.position
    const where = await board("Dashboard")
    const from = center(await titleOf("Dashboard"))
    await app.drag(from, { x: from.x + 160, y: from.y + 60 }, async () => {
      await expect.poll(async () => (await board("Dashboard")).x).not.toBe(where.x)
      await app.page.keyboard.press("Escape")
      await app.frames(2)
    })
    expect(await board("Dashboard")).toEqual(where)
    expect((await app.designs()).find((design) => design.name === "Dashboard")!.position).toEqual(before)
    expect(await app.undoLabel()).toBeUndefined()
    expect((await app.selection()).design).toBe(await app.key("Dashboard"))
  })
})

describe("the cursor over the canvas (PAR-193)", () => {
  it("is grabbing while a layer is dragged", async () => {
    await app.show("Dashboard", zoom)
    await app.selectLayer("Dashboard", users)
    const to = at(await app.box("Dashboard", issues), 0.8, 0.3)
    const cursor = await app.drag(center(await app.box("Dashboard", users)), to, () => app.cursorAt(to))
    expect(cursor).toBe("grabbing")
  })

  it("is grabbing while a design is dragged by its title, over the title and off it", async () => {
    await app.show("Dashboard", zoom)
    const from = center(await titleOf("Dashboard"))
    const to = { x: from.x + 120, y: from.y + 40 }
    const cursors = await app.drag(from, to, async () => [
      await app.cursorAt(to),
      await app.cursorAt({ x: to.x + 200, y: to.y + 200 })
    ])
    expect(cursors).toEqual(["grabbing", "grabbing"])
  })

  it("shows the handle's arrows while resizing, wherever the pointer goes", async () => {
    const button = "C7E9z"
    await app.show("Dashboard", 1, button)
    await app.selectLayer("Dashboard", button)
    const box = await app.box("Dashboard", button)
    const handle = { x: box.x + box.width, y: box.y + box.height / 2 }
    // Well below the handle, over the design: a right handle follows the pointer across only.
    const to = { x: handle.x + 48, y: handle.y + 80 }
    const cursor = await app.drag(handle, to, () => app.cursorAt(to))
    expect(cursor).toBe("ew-resize")
    // And it's let go once the resize ends.
    expect(await app.cursorAt(to)).not.toBe("ew-resize")
  })

  it("is the text cursor over a design with the text tool", async () => {
    await app.show("Dashboard", zoom)
    await app.page.keyboard.press("t")
    await expect.poll(() => app.tool()).toBe("text")
    const point = center(await app.box("Dashboard", stats))
    await app.page.mouse.move(point.x, point.y)
    expect(await app.cursorAt(point)).toMatch(/\btext$/)
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
