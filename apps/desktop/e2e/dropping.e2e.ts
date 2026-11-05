import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { crc32, deflateSync } from "node:zlib"
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vite-plus/test"
import { App, center } from "./app.ts"

// docs/editor.md, Adding images: dropping image files from Explorer or Finder (PAR-24), with Chromium's own drag
// events carrying real files; and Moving, reordering and resizing: dropping a component from the panel into the slot
// under the pointer (PAR-205), or at the pointer in a layout that's placed absolutely.

let app: App
let folder: string
const files = { png: "", svg: "", text: "" }

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-e2e-drop-"))
  files.png = join(folder, "Wide banner.png")
  files.svg = join(folder, "logo.svg")
  files.text = join(folder, "notes.txt")
  await writeFile(files.png, png(60, 30))
  await writeFile(
    files.svg,
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="teal"/></svg>'
  )
  await writeFile(files.text, "Not an image")
  app = await App.connect()
})
afterEach(() => app?.reset())
afterAll(async () => {
  await app?.close()
  await rm(folder, { recursive: true, force: true })
})

/** Pricing's Hero: a badge, the headline, the lede and the billing period, in a column. */
const hero = "t3Reo"
const [badge, headline, lede, billing] = ["P07mQ", "crd2J", "so61t", "UKxSY"]

/** The point in the gap between the lede and the billing period, where a layer dragged there would land. */
async function belowLede(): Promise<{ x: number; y: number }> {
  const below = await app.box("Pricing", lede)
  return { x: center(below).x, y: below.y + below.height + 4 }
}

const hint = () => app.page.locator("[data-drop-hint]")
const toasts = () => app.page.locator("[data-sonner-toast]").allInnerTexts()

/** A PNG of one color, `width` by `height` pixels. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const check = Buffer.alloc(4)
    check.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, check])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  // Eight bits a channel, RGB, and the standard compression, filter and no interlacing.
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, Buffer.from([220, 80, 40]))])
  const pixels = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0))
  ])
}

describe("dropping image files", () => {
  it("puts a PNG and an SVG side by side in the slot under the pointer, saved into the project, as one undo step", async () => {
    await app.show("Pricing", 0.5, hero)
    const point = await belowLede()
    // While they're dragged over the Hero, the canvas outlines it, marks the slot and says what a drop does.
    const shown = await app.dropFiles([files.png, files.svg], [{ x: point.x, y: point.y - 60 }, point], async () => {
      await expect.poll(() => hint().innerText()).toBe("Add 2 images here")
      return {
        line: await app.page.locator("[data-drop-line]").count(),
        outline: await app.page.locator("[data-drop-outline]").count()
      }
    })
    expect(shown).toEqual({ line: 1, outline: 1 })
    await expect.poll(async () => (await app.children("Pricing", hero)).length, { timeout: 10_000 }).toBe(6)
    expect(await hint().count()).toBe(0)
    const children = await app.children("Pricing", hero)
    const [wide, logo] = children.slice(3, 5) as [string, string]
    expect(children).toEqual([badge, headline, lede, wide, logo, billing])
    // Each at its own proportions, 80 steps wide, and saved under public/images/ named after its file.
    const [banner, vector] = [await app.node("Pricing", wide), await app.node("Pricing", logo)]
    expect(banner).toMatchObject({
      type: "image",
      src: expect.stringMatching(/^\/images\/wide-banner-[0-9a-f]{8}\.png$/)
    })
    expect(banner?.style).toEqual({ width: 80, height: 40 })
    expect(vector).toMatchObject({ type: "image", src: expect.stringMatching(/^\/images\/logo-[0-9a-f]{8}\.svg$/) })
    expect(vector?.style).toEqual({ width: 80, height: 80 })
    const { project } = inject("app")
    for (const image of [banner, vector]) {
      expect(existsSync(join(project, "public", image?.type === "image" ? image.src : "missing"))).toBe(true)
    }
    expect((await app.selection()).nodes).toEqual([wide, logo])
    expect(await app.undoLabel()).toBe("Drop 2 images")
    // One undo takes both out, and leaves the files, as undoing a paste does.
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Pricing", hero)).toEqual([badge, headline, lede, billing])
    for (const image of [banner, vector]) {
      expect(existsSync(join(project, "public", image?.type === "image" ? image.src : "missing"))).toBe(true)
    }
  })

  it("makes a new design with the image where it's dropped on the empty canvas", async () => {
    const { screen, page } = await app.showEmptyCanvas()
    const before = await app.designs()
    const shown = await app.dropFiles([files.svg], screen, async () => {
      await expect.poll(() => hint().innerText()).toBe("New screen with the image")
      return app.page.locator("[data-drop-corner]").count()
    })
    expect(shown).toBe(1)
    await expect.poll(async () => (await app.designs()).length, { timeout: 10_000 }).toBe(before.length + 1)
    const added = (await app.designs()).find((design) => !before.some((old) => old.key === design.key))!
    expect(added).toMatchObject({ name: "logo", position: page })
    expect(await app.selection()).toEqual({ design: added.key })
    const [image] = await app.children("logo", await rootOf("logo"))
    expect(await app.node("logo", image!)).toMatchObject({ type: "image", style: { width: 80, height: 80 } })
    expect(await app.undoLabel()).toBe("Drop image")
    await app.page.keyboard.press("Control+z")
    await expect.poll(async () => (await app.designs()).length).toBe(before.length)
  })

  it("skips files that aren't images with a message naming them, and adds the rest", async () => {
    await app.show("Pricing", 0.5, hero)
    await app.dropFiles([files.text, files.png], await belowLede())
    await expect.poll(async () => (await app.children("Pricing", hero)).length, { timeout: 10_000 }).toBe(5)
    await expect
      .poll(async () => (await toasts()).join("\n"))
      .toContain("notes.txt isn't a PNG, JPEG, GIF, WebP or SVG image.")
    expect((await toasts()).join("\n")).toContain("Skipped notes.txt")
    expect(await app.undoLabel()).toBe("Drop image")
  })

  it("adds nothing and shows nothing once a drag is called off", async () => {
    await app.show("Pricing", 0.5, hero)
    await app.dropFiles(
      [files.png],
      await belowLede(),
      async () => {
        await expect.poll(() => hint().count()).toBe(1)
      },
      true
    )
    await expect.poll(() => hint().count()).toBe(0)
    expect(await app.children("Pricing", hero)).toEqual([badge, headline, lede, billing])
    expect(await app.undoLabel()).toBeUndefined()
  })
})

describe("dropping a component from the panel", () => {
  it("lands in the slot under the pointer in a grid's second row, not along its first (PAR-205)", async () => {
    // Projects' grid: three cards a row, two rows.
    const grid = "OAEPX"
    const cards = ["HY5tQ", "MJct6", "MBVoe", "CySw9", "LpVGP", "HBxmB"]
    await app.show("Projects", 0.5, grid)
    await app.page.keyboard.press("Alt+2")
    await app.page.getByRole("textbox", { name: "Search components" }).fill("Badge")
    const badge = app.page
      .getByRole("button")
      .filter({ hasText: /^Badge$/ })
      .first()
    const from = center((await badge.boundingBox())!)
    // The left of the second row's middle card: before it, where one line along every card would put it second.
    const fifth = await app.box("Projects", cards[4]!)
    const to = { x: fifth.x + fifth.width / 4, y: fifth.y + fifth.height / 2 }
    const shown = await app.drag(from, to, async () => {
      await expect.poll(() => app.page.locator("[data-drop-line]").count()).toBe(1)
      const line = (await app.page.locator("[data-drop-line]").boundingBox())!
      return {
        outline: await app.page.locator("[data-drop-outline]").count(),
        // The line stands just left of the fifth card, in its row.
        beside: Math.abs(line.x + line.width - fifth.x) < 6 && line.y >= fifth.y - 1 && line.y < fifth.y + fifth.height
      }
    })
    expect(shown).toEqual({ outline: 1, beside: true })
    await expect.poll(async () => (await app.children("Projects", grid)).length).toBe(7)
    const children = await app.children("Projects", grid)
    const added = children[4]!
    expect(children).toEqual([...cards.slice(0, 4), added, ...cards.slice(4)])
    expect(await app.node("Projects", added)).toMatchObject({ type: "component", component: "Badge" })
    expect((await app.selection()).node).toBe(added)
    expect(await app.undoLabel()).toBe("Add Badge")
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Projects", grid)).toEqual(cards)
  })

  it("makes a screen named after it where it's dropped on the empty canvas (PAR-546)", async () => {
    await app.page.keyboard.press("Alt+2")
    await app.page.getByRole("textbox", { name: "Search components" }).fill("Badge")
    const badge = app.page
      .getByRole("button")
      .filter({ hasText: /^Badge$/ })
      .first()
    const from = center((await badge.boundingBox())!)
    const { screen, page } = await app.showEmptyCanvas()
    const before = await app.designs()
    const shown = await app.drag(from, screen, async () => {
      await expect.poll(() => app.page.locator("[data-drop-corner]").count()).toBe(1)
      return app.page.locator("[data-drop-outline]").count()
    })
    // A corner marks where the screen starts, and there's no layout to outline.
    expect(shown).toBe(0)
    await expect.poll(async () => (await app.designs()).length).toBe(before.length + 1)
    const added = (await app.designs()).find((design) => !before.some((old) => old.key === design.key))!
    expect(added).toMatchObject({ name: "Badge", position: page })
    expect(await app.selection()).toEqual({ design: added.key })
    const [child] = await app.children(added.name, await rootOf(added.name))
    expect(await app.node(added.name, child!)).toMatchObject({ type: "component", component: "Badge" })
    expect(await app.undoLabel()).toBe("Add Badge")
    await app.page.keyboard.press("Control+z")
    await expect.poll(async () => (await app.designs()).length).toBe(before.length)
  })

  it("lands at the pointer, last, in a layout that's placed absolutely", async () => {
    // Calendar's Events: placed absolutely over the day's timeline, holding the event slots, the first at top 16.
    const events = "zEb2T"
    const planning = "aAaEs"
    const before = await app.children("Calendar", events)
    await app.show("Calendar", 1, planning)
    await app.page.keyboard.press("Alt+2")
    await app.page.getByRole("textbox", { name: "Search components" }).fill("Badge")
    const badge = app.page
      .getByRole("button")
      .filter({ hasText: /^Badge$/ })
      .first()
    const from = center((await badge.boundingBox())!)
    // Above the Planning slot, 40px of the design right of Events' left and 24px below its top: 10 and 6 steps.
    const box = await app.box("Calendar", events)
    const to = { x: box.x + 40, y: box.y + 24 }
    const shown = await app.drag(from, to, async () => {
      await expect.poll(() => app.page.locator("[data-drop-corner]").count()).toBe(1)
      return {
        outline: await app.page.locator("[data-drop-outline]").count(),
        line: await app.page.locator("[data-drop-line]").count()
      }
    })
    // A corner marks where it goes, and no line, as there's no slot among children placed absolutely.
    expect(shown).toEqual({ outline: 1, line: 0 })
    await expect.poll(async () => (await app.children("Calendar", events)).length).toBe(before.length + 1)
    const children = await app.children("Calendar", events)
    const added = children.at(-1)!
    expect(children).toEqual([...before, added])
    expect(await app.node("Calendar", added)).toMatchObject({
      type: "component",
      component: "Badge",
      style: { position: "absolute", left: 10, top: 6 }
    })
    expect((await app.selection()).node).toBe(added)
    expect(await app.undoLabel()).toBe("Add Badge")
    await app.page.keyboard.press("Control+z")
    await expect.poll(() => app.children("Calendar", events)).toEqual(before)
  })
})

/** A design's root layer, by its name. */
function rootOf(design: string): Promise<string> {
  return app.page.evaluate((design) => {
    const e2e = window.e2e!
    return e2e.session().store.getEntry(e2e.key(design))!.container.root.id
  }, design)
}
