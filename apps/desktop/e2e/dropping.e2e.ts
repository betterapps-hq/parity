import { existsSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { crc32, deflateSync } from "node:zlib"
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from "vite-plus/test"
import { App, center } from "./app.ts"

// docs/editor.md, Adding images: dropping image files from Explorer or Finder (PAR-24), with Chromium's own drag
// events carrying real files.

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
      await expect.poll(() => hint().innerText()).toBe("New design with the image")
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

/** A design's root layer, by its name. */
function rootOf(design: string): Promise<string> {
  return app.page.evaluate((design) => {
    const e2e = window.e2e!
    return e2e.session().store.getEntry(e2e.key(design))!.container.root.id
  }, design)
}
