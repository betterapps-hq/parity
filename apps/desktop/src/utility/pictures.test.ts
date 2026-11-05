import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import type { PictureFrame, ProjectPicture } from "../shared/protocol.ts"
import type * as Pictures from "./pictures.ts"

// docs/editor.md, The start page: a project's picture, kept for Home (PAR-607).

let folder: string
let pictures: typeof Pictures

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "parity-pictures-"))
  vi.stubEnv("PARITY_PICTURE_DIR", folder)
  vi.resetModules()
  pictures = await import("./pictures.ts")
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(folder, { recursive: true, force: true })
})

/** A frame's bitmap as a data URL: a PNG of a solid color, as tall as the frame's content. */
async function bitmap(width: number, height: number): Promise<string> {
  const png = await sharp({ create: { width, height, channels: 3, background: "#3366cc" } })
    .png()
    .toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

async function sizeOf(frame: PictureFrame): Promise<{ format?: string; width?: number; height?: number }> {
  const data = Buffer.from(frame.src.slice(frame.src.indexOf(",") + 1), "base64")
  const { format, width, height } = await sharp(data).metadata()
  return { format, width, height }
}

async function picture(name = "Dashboard"): Promise<ProjectPicture> {
  return {
    taken: 1_000,
    screens: [
      {
        name,
        // A desktop page three windows tall, as a quarter-size bitmap.
        main: { src: await bitmap(320, 600), mode: "Desktop", width: 1280, height: 800 },
        // A phone frame no taller than its window.
        phone: { src: await bitmap(98, 150), mode: "Mobile", width: 390, height: 844 }
      }
    ]
  }
}

describe("pictures", () => {
  it("keeps a project's picture with each frame cut to the top of its window, and reads it back", async () => {
    const kept = await pictures.storePicture("D:/apps/shop", await picture())
    const [screen] = kept.screens
    expect(await sizeOf(screen!.main)).toEqual({ format: "webp", width: 320, height: 200 })
    expect(await sizeOf(screen!.phone!)).toEqual({ format: "png", width: 98, height: 150 })
    expect(screen).toMatchObject({ name: "Dashboard", main: { mode: "Desktop", width: 1280, height: 800 } })

    expect(await pictures.readPictures(["D:/apps/shop"])).toEqual({ "D:/apps/shop": kept })
  })

  it("keeps the latest picture in place of the one before", async () => {
    await pictures.storePicture("D:/apps/shop", await picture("Dashboard"))
    await pictures.storePicture("D:/apps/shop", await picture("Pricing"))
    const read = await pictures.readPictures(["D:/apps/shop"])
    expect(read["D:/apps/shop"]?.screens.map(({ name }) => name)).toEqual(["Pricing"])
    expect(await readdir(folder)).toHaveLength(1)
  })

  it("leaves out projects with none kept, and a file that can't be read", async () => {
    await pictures.storePicture("D:/apps/blog", await picture())
    const [blog] = await readdir(folder)
    await writeFile(join(folder, blog!), "{ not json")
    await pictures.storePicture("D:/apps/shop", await picture())
    const read = await pictures.readPictures(["D:/apps/shop", "D:/apps/blog", "D:/apps/never-opened"])
    expect(Object.keys(read)).toEqual(["D:/apps/shop"])
  })

  it("refuses a kept picture whose frames aren't images", async () => {
    await pictures.storePicture("D:/apps/shop", await picture())
    const [file] = await readdir(folder)
    const kept = {
      root: "D:/apps/shop",
      taken: 1,
      screens: [{ name: "Home", main: { src: "javascript:alert(1)", mode: "Desktop", width: 1, height: 1 } }]
    }
    await writeFile(join(folder, file!), JSON.stringify(kept))
    expect(await pictures.readPictures(["D:/apps/shop"])).toEqual({})
  })

  it("lets go of the pictures of projects no longer listed, and of old partial files only", async () => {
    await pictures.storePicture("D:/apps/shop", await picture())
    await pictures.storePicture("D:/apps/blog", await picture())
    await writeFile(join(folder, "a.json.1.x.partial"), "")
    await writeFile(join(folder, "b.json.1.y.partial"), "")
    const old = new Date(Date.now() - 120_000)
    await utimes(join(folder, "a.json.1.x.partial"), old, old)

    await pictures.keepOnlyPictures(["D:/apps/shop"])

    expect(Object.keys(await pictures.readPictures(["D:/apps/shop", "D:/apps/blog"]))).toEqual(["D:/apps/shop"])
    expect((await readdir(folder)).filter((name) => name.endsWith(".partial"))).toEqual(["b.json.1.y.partial"])
  })

  it("keeps nothing without a folder, but still cuts the frames", async () => {
    vi.unstubAllEnvs()
    vi.stubEnv("PARITY_PICTURE_DIR", "")
    vi.resetModules()
    const unkept = await import("./pictures.ts")
    const kept = await unkept.storePicture("D:/apps/shop", await picture())
    expect(await sizeOf(kept.screens[0]!.main)).toMatchObject({ height: 200 })
    expect(await unkept.readPictures(["D:/apps/shop"])).toEqual({})
    expect(await readdir(folder)).toEqual([])
  })
})
