import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test"
import { App, type Box, center } from "./app.ts"

// docs/editor.md, Moving, reordering and resizing (CAN-47, PAR-193, PAR-204): dragging layers, where they land, moving
// an absolutely placed layer, resize handles, empty layouts, cursors and Escape during a gesture, duplicating a design,
// and bringing a copy that lands off screen into view, on the example's Dashboard and Calendar.

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
    await expect
      .poll(() => app.style("Calendar", review))
      .toMatchObject({
        top: { step: 40 },
        left: { step: 6 },
        right: { step: -6 },
        height: { step: 16 }
      })
  })

  it("moves a negative inset and sides set by tokens from where they're drawn", async () => {
    // Set up as the hand check was: left -2, and the right and top set to the spacing token.
    await app.page.evaluate((review) => {
      const e2e = window.e2e!
      const key = e2e.key("Calendar")
      e2e.session().store.updateContainer(key, "Set up insets", (container) => {
        const edit = (node: typeof container.root): typeof container.root => {
          if (node.id === review) {
            return {
              ...node,
              style: { ...node.style, left: { step: -2 }, right: { token: "spacing" }, top: { token: "spacing" } }
            }
          }

          return node.type === "layout" ? { ...node, children: node.children.map(edit) } : node
        }

        return { ...container, root: edit(container.root) }
      })
    }, review)
    await app.show("Calendar", zoom, review)
    await app.selectLayer("Calendar", review)
    const before = await app.box("Calendar", review)
    // With Ctrl, so its left doesn't snap to the parent's, 8px away (PAR-174).
    await app.drag(center(before), { x: center(before).x + 16 * zoom, y: center(before).y }, undefined, ["Control"])
    await expect
      .poll(() => app.style("Calendar", review))
      .toMatchObject({
        top: { token: "spacing" },
        left: { step: 2 },
        right: { step: -3 }
      })
    expect((await app.box("Calendar", review)).width).toBeCloseTo(before.width, 0)
  })
})

// The Review slot sits between the Planning slot (top 16) and the Lunch slot (top 64), 8 steps from each, all 16 steps
// high and as wide as the day.
describe("snapping an absolutely placed layer (PAR-174)", () => {
  /** What tldraw's snap indicators show: a guide is `points`, spacing marks `gaps`, with how many gaps each marks. */
  const indicators = () =>
    app.page.evaluate(() =>
      (window.e2e!.session().editor?.snaps.getIndicators() ?? []).map((indicator) =>
        indicator.type === "gaps" ? `gaps:${indicator.gaps.length}` : indicator.type
      )
    )

  /** Distance labels on the overlay reading 32px, the gap between the slots. */
  const distances = () =>
    app.page
      .locator("span")
      .filter({ hasText: /^32px$/ })
      .count()

  it("holds a layer evenly spaced with its siblings, with spacing marks, a guide and the distance", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const from = center(await app.box("Calendar", review))
    const before = await distances()

    // 6px down is within 8 of where it's evenly spaced, so it stays.
    const during = await app.drag(from, { x: from.x, y: from.y + 6 }, async () => ({
      indicators: await indicators(),
      distances: await distances(),
      style: await app.style("Calendar", review)
    }))

    // Marks in the three gaps, Planning to Review, Review to Lunch and Lunch to Usability, and a guide along its left,
    // which lines up with Planning's, whose distance to it shows.
    expect(during?.indicators).toEqual(expect.arrayContaining(["points", "gaps:3"]))
    expect(during?.distances).toBeGreaterThan(before)
    expect(during?.style).toMatchObject({ top: { step: 40 } })
    expect(await app.undoLabel()).toBeUndefined()
    expect(await indicators()).toEqual([])
    expect(await distances()).toBe(before)
  })

  it("shows the move as it goes, locks its bottom to the next layer's top and writes it once dropped", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const before = await app.box("Calendar", review)
    const from = center(before)

    // 36px down puts its bottom 4px past the Lunch slot's top, so it locks there: top 48, not 49. That's 8 steps down,
    // half its 16 steps of height. The design is written only when it's dropped (PAR-551).
    const during = await app.drag(from, { x: from.x, y: from.y + 36 }, async () => ({
      style: await app.style("Calendar", review),
      box: await app.box("Calendar", review)
    }))

    expect(during?.style).toMatchObject({ top: { step: 40 } })
    expect(during?.box.y).toBeCloseTo(before.y + before.height / 2, 0)
    await expect
      .poll(() => app.style("Calendar", review))
      .toMatchObject({
        top: { step: 48 },
        left: { step: 0 },
        right: { step: 0 },
        height: { step: 16 }
      })
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.style("Calendar", review)).toMatchObject({ top: { step: 40 } })
  })

  it("moves freely with Ctrl held", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const from = center(await app.box("Calendar", review))
    const during = await app.drag(from, { x: from.x, y: from.y + 36 }, indicators, ["Control"])
    expect(during).toEqual([])
    await expect.poll(() => app.style("Calendar", review)).toMatchObject({ top: { step: 49 } })
  })

  it("puts a move back when Escape is pressed mid-drag, leaving nothing to undo", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const before = await app.box("Calendar", review)
    const from = center(before)
    await app.drag(from, { x: from.x, y: from.y + 36 }, async () => {
      await expect.poll(async () => (await app.box("Calendar", review)).y).toBeGreaterThan(before.y + 1)
      await app.page.keyboard.press("Escape")
      await app.frames(2)
    })
    expect(await app.style("Calendar", review)).toMatchObject({ top: { step: 40 } })
    expect((await app.box("Calendar", review)).y).toBeCloseTo(before.y, 0)
    expect(await app.undoLabel()).toBeUndefined()
    expect(await indicators()).toEqual([])
  })

  it("locks a dragged edge to a sibling's when resizing", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const box = await app.box("Calendar", review)
    const bottom = { x: box.x + box.width / 2, y: box.y + box.height }
    // 26px down puts its bottom 6px short of the Lunch slot's top: 24 steps high, where steps alone would make it 23.
    await app.drag(bottom, { x: bottom.x, y: bottom.y + 26 })
    await expect.poll(() => app.style("Calendar", review)).toMatchObject({ top: { step: 40 }, height: { step: 24 } })
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
    await expect.poll(() => app.steps("Dashboard", button, "width")).toBe(Math.round((box.width + 48) / 4))
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
    await expect
      .poll(() => app.style("Calendar", review))
      .toMatchObject({
        top: { step: 36 },
        height: { step: 20 },
        left: { step: 0 },
        right: { step: 0 }
      })
    const after = await app.box("Calendar", review)
    expect(after.y + after.height).toBeCloseTo(box.y + box.height, 0)
  })

  it("moves only the left inset with the left handle of a stretched layer", async () => {
    await app.show("Calendar", 1, review)
    await app.selectLayer("Calendar", review)
    const box = await app.box("Calendar", review)
    const left = { x: box.x, y: box.y + box.height / 2 }
    await app.drag(left, { x: left.x + 12, y: left.y })
    await expect
      .poll(() => app.style("Calendar", review))
      .toMatchObject({
        left: { step: 3 },
        right: { step: 0 },
        top: { step: 40 },
        height: { step: 16 }
      })
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

  it("makes a slow resize one undo step, however long it pauses (PAR-441)", async () => {
    await app.show("Dashboard", 1, button)
    await app.selectLayer("Dashboard", button)
    const box = await app.box("Dashboard", button)
    const handle = { x: box.x + box.width, y: box.y + box.height / 2 }
    const width = () => app.steps("Dashboard", button, "width")
    // A write, a pause longer than a second, then more writes, which grouping by time made two undo steps.
    await app.drag(handle, { x: handle.x + 24, y: handle.y }, async () => {
      await expect.poll(width).toBe(Math.round((box.width + 24) / 4))
      await app.page.waitForTimeout(1500)
      await app.page.mouse.move(handle.x + 48, handle.y, { steps: 6 })
      await expect.poll(width).toBe(Math.round((box.width + 48) / 4))
    })
    expect(await app.undoLabel()).toBe("Resize layer")
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.style("Dashboard", button)).toEqual({})
    expect(await app.undoLabel()).toBeUndefined()
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

    for (const handle of inside) {
      expect(handle.width).toBeLessThanOrEqual(8)
    }

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
          if (node.type !== "layout") {
            return node
          }

          const children = node.children.map(edit)

          if (node.id === "JWWeK") {
            children.push({ type: "layout", id: "empty", style: { flexDirection: "row" }, children: [] })
          }

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

  if (!box) {
    throw new Error(`${design}'s title isn't drawn`)
  }

  return box
}

describe("dragging a design by its title", () => {
  /** Where tldraw has the design's board on the page. */
  async function board(design: string): Promise<{ x: number; y: number }> {
    const key = await app.key(design)

    return app.page.evaluate((key) => {
      const found = window
        .e2e!.session()
        .editor!.getCurrentPageShapes()
        .find((candidate) => candidate.id.endsWith(encodeURIComponent(key)))

      if (!found) {
        throw new Error(`No board for ${key}`)
      }

      return { x: found.x, y: found.y }
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

      return editor.getCurrentPageShapes().map((item) => {
        const { minX, minY, maxX, maxY } = editor.getShapePageBounds(item)!

        return { id: item.id, minX, minY, maxX, maxY }
      })
    })

    const dashboard = before.find((design) => design.name === "Dashboard")!
    // Top-aligned with the original, to its right.
    expect(copy.position.y).toBe(dashboard.position.y)
    expect(copy.position.x).toBeGreaterThan(dashboard.position.x)
    const mine = bounds.find((item) => item.id.endsWith(encodeURIComponent(copy.key)))!

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

  it("brings a copy that lands off screen into view, at the same zoom (PAR-204)", async () => {
    // At 50% Dashboard runs past the canvas's right edge, so its copy beside it starts well off screen.
    await app.show("Dashboard", 0.5)
    await app.selectDesign("Dashboard")
    const before = await app.camera()
    expect(await inView(await copyBounds("Dashboard"))).toBe(false)
    const copy = await duplicated(() => app.page.keyboard.press("Control+d"))
    await settled()
    const after = await app.camera()
    expect(after.z).toBe(before.z)
    expect(after.x).not.toBe(before.x)
    expect(await inView(await boundsOf(copy))).toBe(true)
  })

  it("brings a pasted design that lands off screen into view too", async () => {
    await app.show("Dashboard", 0.5)
    await app.selectDesign("Dashboard")
    await app.page.keyboard.press("Control+c")
    await expect.poll(() => app.clipboard()).toContain('"parity":"clipboard"')
    const before = await app.camera()
    const copy = await duplicated(() => app.page.keyboard.press("Control+v"))
    await settled()
    expect((await app.camera()).z).toBe(before.z)
    expect(await inView(await boundsOf(copy))).toBe(true)
  })

  it("leaves the view where it was when the copy lands in it", async () => {
    // Forgot password is the last design in its row, so its copy goes just beside it, well inside the view at 5%.
    await app.show("Forgot password", 0.05)
    await app.selectDesign("Forgot password")
    const before = await app.camera()
    const copy = await duplicated(() => app.page.keyboard.press("Control+d"))
    await settled()
    expect(await inView(await boundsOf(copy))).toBe(true)
    expect(await app.camera()).toEqual(before)
  })
})

interface PageBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Runs `act`, which adds one design, and returns the new design's key once it's there. */
async function duplicated(act: () => Promise<void>): Promise<string> {
  const before = await app.designs()
  await act()
  await expect.poll(async () => (await app.designs()).length).toBe(before.length + 1)
  const copy = (await app.designs()).find((design) => !before.some((other) => other.key === design.key))!
  expect((await app.selection()).design).toBe(copy.key)

  return copy.key
}

/** Where a design is on the canvas, in page coordinates. */
function boundsOf(key: string): Promise<PageBounds> {
  return app.page.evaluate((key) => {
    const editor = window.e2e!.session().editor!
    const board = editor.getCurrentPageShapes().find((candidate) => candidate.id.endsWith(encodeURIComponent(key)))!
    const { minX, minY, maxX, maxY } = editor.getShapePageBounds(board)!

    return { minX, minY, maxX, maxY }
  }, key)
}

/** Where a copy of a design would land beside it, by the gap a duplicate keeps, before it's made. */
async function copyBounds(design: string): Promise<PageBounds> {
  const original = await boundsOf(await app.key(design))
  const shift = original.maxX - original.minX + 160

  return { ...original, minX: original.minX + shift, maxX: original.maxX + shift }
}

/** Whether a design's top left corner, where its title is, is in the view. */
function inView(bounds: PageBounds): Promise<boolean> {
  return app.page.evaluate((bounds) => {
    const view = window.e2e!.session().editor!.getViewportPageBounds()

    return bounds.minX >= view.minX && bounds.minX < view.maxX && bounds.minY >= view.minY && bounds.minY < view.maxY
  }, bounds)
}

/** Waits for the camera to finish moving, once it's had time to start. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400))
  await expect
    .poll(() => app.page.evaluate(() => window.e2e!.session().editor!.getCameraState()), { timeout: 5000 })
    .toBe("idle")
  await app.frames(2)
}
