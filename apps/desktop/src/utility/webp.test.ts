import sharp from "sharp"
import { describe, expect, it } from "vite-plus/test"
import { composePicture, composeSheet, cutPicture, losslessWebp, sharpRefusal } from "./webp.ts"

describe("sharpRefusal", () => {
  it("keeps sharp out of Electron on Linux, where it crashed the service, and nowhere else", () => {
    expect(sharpRefusal("linux", "45.2.1")).toMatch(/PAR-688/)
    expect(sharpRefusal("linux", undefined)).toBeUndefined()
    expect(sharpRefusal("win32", "45.2.1")).toBeUndefined()
    expect(sharpRefusal("darwin", "45.2.1")).toBeUndefined()
  })
})

/** Pixels with edges and soft gradients, as a frame's text and shadows have, as a PNG. */
async function picture(): Promise<Buffer> {
  const width = 37
  const height = 23
  const pixels = Buffer.alloc(width * height * 3)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3
      pixels[at] = (x * 7) % 256
      pixels[at + 1] = (y * 11 + x) % 256
      pixels[at + 2] = x > 18 ? 250 : (x * y) % 256
    }
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer()
}

describe("losslessWebp", () => {
  it("gives a WebP of the same pixels", async () => {
    const png = await picture()
    const webp = await losslessWebp(png)
    expect(webp.subarray(8, 12).toString("latin1")).toBe("WEBP")

    const [before, after] = await Promise.all(
      [png, webp].map((image) => sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true }))
    )

    expect(after!.info).toMatchObject({ width: 37, height: 23 })
    expect(after!.data.equals(before!.data)).toBe(true)
  })
})

describe("cutPicture", () => {
  it("cuts part of a picture as a PNG with its pixels", async () => {
    const png = await picture()
    const cut = await cutPicture(png, { left: 19, top: 5, width: 10, height: 8 }, "png")

    const [whole, part] = await Promise.all([
      sharp(png).extract({ left: 19, top: 5, width: 10, height: 8 }).raw().toBuffer(),
      sharp(cut).raw().toBuffer({ resolveWithObject: true })
    ])

    expect(part.info).toMatchObject({ width: 10, height: 8, format: "raw" })
    expect(part.data.equals(whole)).toBe(true)
  })

  it("makes a JPG's see-through parts white", async () => {
    const clear = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .png()
      .toBuffer()

    const jpg = await cutPicture(clear, { left: 0, top: 0, width: 4, height: 4 }, "jpg")
    const { data, info } = await sharp(jpg).raw().toBuffer({ resolveWithObject: true })
    expect((await sharp(jpg).metadata()).format).toBe("jpeg")
    expect(info.channels).toBe(3)
    expect(Math.min(...data)).toBeGreaterThan(250)
  })
})

describe("composePicture", () => {
  it("gives one piece filling the picture exactly as a PNG export cuts it", async () => {
    const png = await picture()
    const crop = { left: 3, top: 2, width: 12, height: 9 }

    const [copied, exported] = await Promise.all([
      composePicture([{ picture: png, crop, left: 0, top: 0 }], 12, 9),
      cutPicture(png, crop, "png")
    ])

    expect(copied.equals(exported)).toBe(true)
  })

  it("puts pieces where they go, see-through between them", async () => {
    const png = await picture()
    const crop = { left: 0, top: 0, width: 4, height: 4 }

    const composed = await composePicture(
      [
        { picture: png, crop, left: 0, top: 0 },
        { picture: png, crop, left: 10, top: 6 }
      ],
      14,
      10
    )

    const { data, info } = await sharp(composed).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(info).toMatchObject({ width: 14, height: 10 })
    const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]
    expect([alpha(1, 1), alpha(7, 3), alpha(12, 8)]).toEqual([255, 0, 255])

    const [original, placed] = await Promise.all([
      sharp(png).extract(crop).ensureAlpha().raw().toBuffer(),
      sharp(composed)
        .ensureAlpha()
        .extract({ ...crop, left: 10, top: 6 })
        .raw()
        .toBuffer()
    ])

    expect(placed.equals(original)).toBe(true)
  })
})

describe("composeSheet", () => {
  it("draws the overlay and scales each frame into its box over it", async () => {
    const png = (await picture()).toString("base64")

    const overlay =
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><rect width="60" height="40" fill="#ff0000"/></svg>'

    const sheet = await composeSheet({
      width: 60,
      height: 40,
      overlay,
      frames: [{ png, x: 10, y: 5, width: 20, height: 10 }]
    })

    const { data, info } = await sharp(sheet).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(info).toMatchObject({ width: 60, height: 40 })
    const pixel = (x: number, y: number) => [...data.subarray((y * 60 + x) * 3, (y * 60 + x) * 3 + 3)]
    expect(pixel(2, 2)).toEqual([255, 0, 0])
    expect(pixel(15, 8)).not.toEqual([255, 0, 0])
    expect(pixel(45, 30)).toEqual([255, 0, 0])
  })
})
